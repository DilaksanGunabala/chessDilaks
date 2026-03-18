import { useState, useCallback, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const PIECE_TYPES = { PAWN: "P", ROOK: "R", KNIGHT: "N", BISHOP: "B", QUEEN: "Q", KING: "K" };
const COLORS = { WHITE: "w", BLACK: "b" };
const GAME_RESULT = { ONGOING: "ongoing", CHECKMATE: "checkmate", STALEMATE: "stalemate", DRAW: "draw", RESIGNED: "resigned" };

// ─── Piece Unicode Symbols ────────────────────────────────────────────────────
const PIECE_SYMBOLS = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

// ─── Initial Board State ──────────────────────────────────────────────────────
function createInitialBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  const backRank = [PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN,
    PIECE_TYPES.KING, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT, PIECE_TYPES.ROOK];

  for (let f = 0; f < 8; f++) {
    board[7][f] = { type: backRank[f], color: COLORS.BLACK };
    board[6][f] = { type: PIECE_TYPES.PAWN, color: COLORS.BLACK };
    board[1][f] = { type: PIECE_TYPES.PAWN, color: COLORS.WHITE };
    board[0][f] = { type: backRank[f], color: COLORS.WHITE };
  }
  return board;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

// ─── Chess Engine ─────────────────────────────────────────────────────────────

function isInBounds(r, f) { return r >= 0 && r < 8 && f >= 0 && f < 8; }

function isEnemy(piece, color) { return piece && piece.color !== color; }

function slidingMoves(board, r, f, directions, color) {
  const moves = [];
  for (const [dr, df] of directions) {
    let nr = r + dr, nf = f + df;
    while (isInBounds(nr, nf)) {
      if (board[nr][nf] === null) { moves.push([nr, nf]); }
      else { if (isEnemy(board[nr][nf], color)) moves.push([nr, nf]); break; }
      nr += dr; nf += df;
    }
  }
  return moves;
}

function getPseudoLegalMoves(board, r, f, castlingRights, enPassantTarget) {
  const piece = board[r][f];
  if (!piece) return [];
  const { type, color } = piece;
  const moves = [];
  const dir = color === COLORS.WHITE ? 1 : -1;

  if (type === PIECE_TYPES.PAWN) {
    if (isInBounds(r + dir, f) && !board[r + dir][f]) {
      moves.push([r + dir, f]);
      const startRank = color === COLORS.WHITE ? 1 : 6;
      if (r === startRank && !board[r + 2 * dir][f]) moves.push([r + 2 * dir, f]);
    }
    for (const df of [-1, 1]) {
      const nr = r + dir, nf = f + df;
      if (isInBounds(nr, nf)) {
        if (isEnemy(board[nr][nf], color)) moves.push([nr, nf]);
        if (enPassantTarget && enPassantTarget[0] === nr && enPassantTarget[1] === nf) moves.push([nr, nf]);
      }
    }
  }

  if (type === PIECE_TYPES.KNIGHT) {
    for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r+dr, nf = f+df;
      if (isInBounds(nr,nf) && (!board[nr][nf] || isEnemy(board[nr][nf], color))) moves.push([nr,nf]);
    }
  }
  if (type === PIECE_TYPES.BISHOP) return slidingMoves(board, r, f, [[-1,-1],[-1,1],[1,-1],[1,1]], color);
  if (type === PIECE_TYPES.ROOK)   return slidingMoves(board, r, f, [[-1,0],[1,0],[0,-1],[0,1]], color);
  if (type === PIECE_TYPES.QUEEN)  return slidingMoves(board, r, f, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]], color);

  if (type === PIECE_TYPES.KING) {
    for (const [dr, df] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r+dr, nf = f+df;
      if (isInBounds(nr,nf) && (!board[nr][nf] || isEnemy(board[nr][nf], color))) moves.push([nr,nf]);
    }
    // Castling
    const rank = color === COLORS.WHITE ? 0 : 7;
    if (r === rank && f === 4) {
      const kRight = color === COLORS.WHITE ? "K" : "k";
      const qRight = color === COLORS.WHITE ? "Q" : "q";
      if (castlingRights[kRight] && !board[rank][5] && !board[rank][6]) moves.push([rank, 6]);
      if (castlingRights[qRight] && !board[rank][3] && !board[rank][2] && !board[rank][1]) moves.push([rank, 2]);
    }
  }
  return moves;
}

function isSquareAttacked(board, r, f, byColor) {
  for (let sr = 0; sr < 8; sr++) {
    for (let sf = 0; sf < 8; sf++) {
      const p = board[sr][sf];
      if (!p || p.color !== byColor) continue;
      const moves = getPseudoLegalMoves(board, sr, sf, {K:false,Q:false,k:false,q:false}, null);
      if (moves.some(([mr,mf]) => mr===r && mf===f)) return true;
    }
  }
  return false;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++)
      if (board[r][f]?.type === PIECE_TYPES.KING && board[r][f]?.color === color) return [r, f];
  return null;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king[0], king[1], color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE);
}

function applyMove(board, from, to, enPassantTarget, castlingRights, promotionPiece = null) {
  const nb = cloneBoard(board);
  const [fr, ff] = from;
  const [tr, tf] = to;
  const piece = nb[fr][ff];
  const newCastling = { ...castlingRights };
  let newEP = null;

  // En passant capture
  if (piece.type === PIECE_TYPES.PAWN && enPassantTarget && tr === enPassantTarget[0] && tf === enPassantTarget[1]) {
    const capturedPawnRank = fr;
    nb[capturedPawnRank][tf] = null;
  }

  // Set en passant target
  if (piece.type === PIECE_TYPES.PAWN && Math.abs(tr - fr) === 2) {
    newEP = [(fr + tr) / 2, ff];
  }

  // Castling move
  if (piece.type === PIECE_TYPES.KING) {
    if (ff === 4 && tf === 6) { nb[fr][5] = nb[fr][7]; nb[fr][7] = null; }
    if (ff === 4 && tf === 2) { nb[fr][3] = nb[fr][0]; nb[fr][0] = null; }
    if (piece.color === COLORS.WHITE) { newCastling.K = false; newCastling.Q = false; }
    else { newCastling.k = false; newCastling.q = false; }
  }

  // Revoke castling rights on rook move
  if (piece.type === PIECE_TYPES.ROOK) {
    if (fr === 0 && ff === 0) newCastling.Q = false;
    if (fr === 0 && ff === 7) newCastling.K = false;
    if (fr === 7 && ff === 0) newCastling.q = false;
    if (fr === 7 && ff === 7) newCastling.k = false;
  }

  // Revoke if rook is captured
  if (tr === 0 && tf === 7) newCastling.K = false;
  if (tr === 0 && tf === 0) newCastling.Q = false;
  if (tr === 7 && tf === 7) newCastling.k = false;
  if (tr === 7 && tf === 0) newCastling.q = false;

  nb[tr][tf] = piece;
  nb[fr][ff] = null;

  // Promotion
  if (piece.type === PIECE_TYPES.PAWN && (tr === 7 || tr === 0)) {
    nb[tr][tf] = { type: promotionPiece || PIECE_TYPES.QUEEN, color: piece.color };
  }

  return { board: nb, enPassantTarget: newEP, castlingRights: newCastling };
}

function getLegalMoves(board, r, f, castlingRights, enPassantTarget) {
  const piece = board[r][f];
  if (!piece) return [];
  const pseudo = getPseudoLegalMoves(board, r, f, castlingRights, enPassantTarget);
  const legal = [];

  for (const [tr, tf] of pseudo) {
    // Validate castling doesn't pass through check
    if (piece.type === PIECE_TYPES.KING && Math.abs(tf - f) === 2) {
      const rank = r;
      const stepF = tf > f ? 1 : -1;
      const opponent = piece.color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
      if (isSquareAttacked(board, rank, f, opponent)) continue;
      if (isSquareAttacked(board, rank, f + stepF, opponent)) continue;
      const { board: nb } = applyMove(board, [r, f], [tr, tf], enPassantTarget, castlingRights);
      if (isInCheck(nb, piece.color)) continue;
      legal.push([tr, tf]);
      continue;
    }
    const { board: nb } = applyMove(board, [r, f], [tr, tf], enPassantTarget, castlingRights);
    if (!isInCheck(nb, piece.color)) legal.push([tr, tf]);
  }
  return legal;
}

function getAllLegalMoves(board, color, castlingRights, enPassantTarget) {
  const all = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++)
      if (board[r][f]?.color === color) {
        const moves = getLegalMoves(board, r, f, castlingRights, enPassantTarget);
        if (moves.length > 0) all.push({ from: [r, f], moves });
      }
  return all;
}

function detectGameResult(board, color, castlingRights, enPassantTarget) {
  const all = getAllLegalMoves(board, color, castlingRights, enPassantTarget);
  if (all.length > 0) return GAME_RESULT.ONGOING;
  if (isInCheck(board, color)) return GAME_RESULT.CHECKMATE;
  return GAME_RESULT.STALEMATE;
}

// ─── PGN Notation ─────────────────────────────────────────────────────────────
const FILES = ["a","b","c","d","e","f","g","h"];
function toAlgebraic(board, from, to, piece, captured, isCheck, isMate, castling, promotionPiece) {
  if (castling === "K") return isMate ? "O-O#" : isCheck ? "O-O+" : "O-O";
  if (castling === "Q") return isMate ? "O-O-O#" : isCheck ? "O-O-O+" : "O-O-O";
  const [,ff] = from; const [tr, tf] = to;
  const pSymbol = piece.type !== PIECE_TYPES.PAWN ? piece.type : "";
  const cap = captured ? "x" : "";
  const file = FILES[tf];
  const rank = tr + 1;
  const fileDisambig = piece.type === PIECE_TYPES.PAWN && captured ? FILES[ff] : "";
  const promo = promotionPiece && piece.type === PIECE_TYPES.PAWN ? `=${promotionPiece}` : "";
  const suffix = isMate ? "#" : isCheck ? "+" : "";
  return `${pSymbol}${fileDisambig}${cap}${file}${rank}${promo}${suffix}`;
}

// ─── Initial Game State ───────────────────────────────────────────────────────
function createInitialGameState() {
  return {
    board: createInitialBoard(),
    turn: COLORS.WHITE,
    castlingRights: { K: true, Q: true, k: true, q: true },
    enPassantTarget: null,
    selectedSquare: null,
    legalMoves: [],
    history: [],
    moveHistory: [],
    gameResult: GAME_RESULT.ONGOING,
    capturedByWhite: [],
    capturedByBlack: [],
    inCheck: false,
    pendingPromotion: null,
    flipped: false,
    clocks: { w: 10 * 60, b: 10 * 60 },
    clockEnabled: false,
    clockConfig: 10,
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Mono:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --sq-light: #f0d9b5;
    --sq-dark: #b58863;
    --sq-selected: #7fc97f;
    --sq-legal: rgba(0,0,0,0.18);
    --sq-check: rgba(220,50,50,0.75);
    --sq-last-from: rgba(255,215,0,0.45);
    --sq-last-to: rgba(255,215,0,0.65);
    --bg: #1a1612;
    --panel: #221e19;
    --panel-border: #3a3228;
    --text: #e8dcc8;
    --text-dim: #8a7a6a;
    --accent: #c8a96e;
    --accent2: #7fc97f;
    --btn: #2e2820;
    --btn-hover: #3e3830;
    --shadow: 0 8px 40px rgba(0,0,0,0.7);
    --w-piece: #fffde7;
    --b-piece: #1a1612;
  }

  body { background: var(--bg); color: var(--text); font-family: 'DM Mono', monospace; min-height: 100vh; }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: radial-gradient(ellipse at 30% 20%, #2a2018 0%, #1a1612 60%, #0f0d0a 100%);
  }

  header {
    width: 100%;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--panel-border);
    background: rgba(0,0,0,0.3);
    backdrop-filter: blur(8px);
  }

  .logo {
    font-family: 'Playfair Display', serif;
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: 0.04em;
    color: var(--accent);
  }
  .logo span { color: var(--text-dim); font-weight: 400; font-size: 0.85rem; margin-left: 10px; }

  .header-badge {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    border: 1px solid var(--panel-border);
    padding: 4px 10px;
    border-radius: 20px;
  }

  .main-layout {
    display: flex;
    gap: 20px;
    padding: 24px 20px;
    align-items: flex-start;
    max-width: 1100px;
    width: 100%;
  }

  .left-panel, .right-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 220px;
    flex-shrink: 0;
  }

  .panel-card {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .panel-label {
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 10px;
  }

  .player-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--panel-border);
    background: var(--panel);
    transition: all 0.2s;
  }
  .player-card.active {
    border-color: var(--accent);
    background: rgba(200,169,110,0.08);
    box-shadow: 0 0 18px rgba(200,169,110,0.15);
  }
  .player-avatar {
    width: 34px; height: 34px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem;
    flex-shrink: 0;
  }
  .player-avatar.white-avatar { background: #f5f0e8; }
  .player-avatar.black-avatar { background: #2a2420; border: 1px solid #444; }
  .player-name {
    font-family: 'Playfair Display', serif;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--text);
  }
  .player-label { font-size: 0.62rem; color: var(--text-dim); margin-top: 1px; }
  .player-clock {
    margin-left: auto;
    font-size: 1rem;
    font-weight: 500;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    transition: color 0.3s;
  }
  .player-clock.warning { color: #e05252; }

  .captured-pieces { font-size: 1rem; letter-spacing: -2px; min-height: 22px; }

  .board-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    flex: 0 0 auto;
  }

  .board-container {
    position: relative;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: var(--shadow), 0 0 0 4px #2a2218, 0 0 0 8px #1a1612;
  }

  .coords-row {
    display: flex;
    width: 480px;
    padding: 0 0 0 18px;
  }
  .coord-cell {
    flex: 1;
    text-align: center;
    font-size: 0.62rem;
    color: var(--text-dim);
    letter-spacing: 0.05em;
    padding: 4px 0;
  }

  .board-grid-wrap { display: flex; }

  .rank-coords {
    display: flex;
    flex-direction: column;
    width: 18px;
    justify-content: stretch;
  }
  .rank-coord {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.62rem;
    color: var(--text-dim);
  }

  .board {
    display: grid;
    grid-template-columns: repeat(8, 60px);
    grid-template-rows: repeat(8, 60px);
    cursor: default;
  }

  .square {
    width: 60px; height: 60px;
    position: relative;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: filter 0.15s;
    user-select: none;
  }
  .square:hover { filter: brightness(1.12); }
  .square.light { background: var(--sq-light); }
  .square.dark  { background: var(--sq-dark); }
  .square.selected { background: var(--sq-selected) !important; }
  .square.last-from { box-shadow: inset 0 0 0 60px var(--sq-last-from); }
  .square.last-to   { box-shadow: inset 0 0 0 60px var(--sq-last-to); }
  .square.in-check  { box-shadow: inset 0 0 0 60px var(--sq-check); }

  .legal-dot {
    position: absolute;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: rgba(0,0,0,0.22);
    pointer-events: none;
    z-index: 1;
    transition: transform 0.1s;
  }
  .legal-dot.capture {
    width: 100%; height: 100%;
    border-radius: 0;
    background: transparent;
    box-shadow: inset 0 0 0 4px rgba(0,0,0,0.28);
  }

  .piece {
    font-size: 2.5rem;
    line-height: 1;
    position: relative;
    z-index: 2;
    transition: transform 0.15s;
    pointer-events: none;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));
  }
  .piece.white-piece { color: var(--w-piece); text-shadow: 0 0 2px rgba(0,0,0,0.8), 1px 1px 0 rgba(0,0,0,0.6); }
  .piece.black-piece { color: var(--b-piece); text-shadow: 0 0 2px rgba(255,255,255,0.15); }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    margin-top: 14px;
    width: 480px;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent2);
    flex-shrink: 0;
    animation: pulse 1.5s infinite;
  }
  .status-dot.inactive { background: var(--text-dim); animation: none; }
  .status-dot.danger { background: #e05252; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .status-text { font-size: 0.75rem; color: var(--text); }
  .status-result { font-family: 'Playfair Display', serif; font-size: 0.9rem; font-weight: 700; color: var(--accent); }

  .controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn {
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid var(--panel-border);
    background: var(--btn);
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
  }
  .btn:hover { background: var(--btn-hover); border-color: var(--accent); color: var(--accent); }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn.accent { background: var(--accent); color: #1a1612; border-color: var(--accent); font-weight: 700; }
  .btn.accent:hover { background: #d4b880; }
  .btn.danger { border-color: #c05050; }
  .btn.danger:hover { background: rgba(200,80,80,0.15); color: #e07070; border-color: #e07070; }

  .move-list {
    max-height: 280px;
    overflow-y: auto;
    font-size: 0.72rem;
    line-height: 1.6;
    scrollbar-width: thin;
    scrollbar-color: var(--panel-border) transparent;
  }
  .move-row { display: flex; gap: 6px; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .move-num { color: var(--text-dim); width: 24px; flex-shrink: 0; }
  .move-w, .move-b { flex: 1; color: var(--text); cursor: pointer; padding: 1px 4px; border-radius: 3px; }
  .move-w:hover, .move-b:hover { background: var(--btn-hover); }

  .clock-select {
    background: var(--btn);
    border: 1px solid var(--panel-border);
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 0.72rem;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    width: 100%;
  }

  /* Promotion Modal */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
    backdrop-filter: blur(4px);
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    padding: 28px 32px;
    box-shadow: var(--shadow);
    text-align: center;
    animation: modalIn 0.2s ease-out;
  }
  @keyframes modalIn { from { transform: scale(0.88); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .modal h2 {
    font-family: 'Playfair Display', serif;
    font-size: 1.2rem;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .modal p { font-size: 0.72rem; color: var(--text-dim); margin-bottom: 20px; }
  .promo-options { display: flex; gap: 12px; justify-content: center; }
  .promo-btn {
    width: 68px; height: 68px;
    background: var(--btn);
    border: 2px solid var(--panel-border);
    border-radius: 10px;
    font-size: 2.6rem;
    cursor: pointer;
    transition: all 0.15s;
    display: flex; align-items: center; justify-content: center;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));
  }
  .promo-btn:hover { border-color: var(--accent); background: var(--btn-hover); transform: scale(1.08); }

  /* Game Over Modal */
  .gameover-modal {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 16px;
    padding: 36px 42px;
    box-shadow: var(--shadow);
    text-align: center;
    max-width: 380px;
    animation: modalIn 0.25s ease-out;
  }
  .gameover-icon { font-size: 3.5rem; margin-bottom: 12px; }
  .gameover-title {
    font-family: 'Playfair Display', serif;
    font-size: 1.8rem;
    font-weight: 900;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .gameover-sub { font-size: 0.8rem; color: var(--text-dim); margin-bottom: 24px; line-height: 1.6; }
  .gameover-actions { display: flex; gap: 10px; justify-content: center; }

  .divider { width: 100%; height: 1px; background: var(--panel-border); margin: 4px 0; }

  @media (max-width: 900px) {
    .main-layout { flex-direction: column; align-items: center; padding: 14px; }
    .left-panel, .right-panel { width: 100%; max-width: 480px; flex-direction: row; flex-wrap: wrap; }
    .left-panel > *, .right-panel > * { flex: 1 1 180px; }
    .board { grid-template-columns: repeat(8, 52px); grid-template-rows: repeat(8, 52px); }
    .square { width: 52px; height: 52px; }
    .board { grid-template-columns: repeat(8, 52px); }
    .coords-row, .status-bar { width: 416px; }
    .rank-coords { display: none; }
    .piece { font-size: 2.1rem; }
  }
`;

// ─── Clock Formatter ──────────────────────────────────────────────────────────
function formatClock(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function ChessApp() {
  const [gs, setGs] = useState(createInitialGameState);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const clockRef = useRef(null);

  // Clock tick
  useEffect(() => {
    if (!gs.clockEnabled || gs.gameResult !== GAME_RESULT.ONGOING || gs.pendingPromotion) return;
    clockRef.current = setInterval(() => {
      setGs(prev => {
        if (prev.gameResult !== GAME_RESULT.ONGOING) { clearInterval(clockRef.current); return prev; }
        const color = prev.turn;
        const newTime = prev.clocks[color] - 1;
        if (newTime <= 0) {
          clearInterval(clockRef.current);
          return { ...prev, clocks: { ...prev.clocks, [color]: 0 }, gameResult: GAME_RESULT.CHECKMATE };
        }
        return { ...prev, clocks: { ...prev.clocks, [color]: newTime } };
      });
    }, 1000);
    return () => clearInterval(clockRef.current);
  }, [gs.turn, gs.clockEnabled, gs.gameResult, gs.pendingPromotion]);

  const handleSquareTap = useCallback((r, f) => {
    setGs(prev => {
      if (prev.gameResult !== GAME_RESULT.ONGOING || prev.pendingPromotion) return prev;

      // Case: legal move target
      if (prev.selectedSquare) {
        const [sr, sf] = prev.selectedSquare;
        const isTarget = prev.legalMoves.some(([lr, lf]) => lr === r && lf === f);

        if (isTarget) {
          const piece = prev.board[sr][sf];
          const captured = prev.board[r][f];
          const isEP = piece.type === PIECE_TYPES.PAWN && prev.enPassantTarget && r === prev.enPassantTarget[0] && f === prev.enPassantTarget[1];
          const epCapture = isEP ? prev.board[sr][f] : null;
          const isPromotion = piece.type === PIECE_TYPES.PAWN && (r === 7 || r === 0);

          if (isPromotion) {
            return { ...prev, pendingPromotion: { from: [sr, sf], to: [r, f] } };
          }

          const castlingType = piece.type === PIECE_TYPES.KING && sf === 4
            ? (f === 6 ? "K" : f === 2 ? "Q" : null) : null;

          const { board: nb, enPassantTarget: newEP, castlingRights: newCR } =
            applyMove(prev.board, [sr, sf], [r, f], prev.enPassantTarget, prev.castlingRights);

          const nextTurn = prev.turn === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
          const inCheck = isInCheck(nb, nextTurn);
          const result = detectGameResult(nb, nextTurn, newCR, newEP);
          const isMate = result === GAME_RESULT.CHECKMATE;

          const notation = toAlgebraic(prev.board, [sr, sf], [r, f], piece,
            captured || (isEP ? epCapture : null), inCheck, isMate, castlingType, null);

          const capturedPiece = captured || (isEP ? epCapture : null);
          const newCaptured = capturedPiece ? (
            prev.turn === COLORS.WHITE
              ? { ...prev, capturedByWhite: [...prev.capturedByWhite, capturedPiece] }
              : { ...prev, capturedByBlack: [...prev.capturedByBlack, capturedPiece] }
          ) : {};

          return {
            ...prev,
            board: nb,
            turn: nextTurn,
            castlingRights: newCR,
            enPassantTarget: newEP,
            selectedSquare: null,
            legalMoves: [],
            history: [...prev.history, { board: prev.board, turn: prev.turn, castlingRights: prev.castlingRights, enPassantTarget: prev.enPassantTarget, capturedByWhite: prev.capturedByWhite, capturedByBlack: prev.capturedByBlack }],
            moveHistory: [...prev.moveHistory, { notation, color: prev.turn, from: [sr, sf], to: [r, f] }],
            gameResult: result,
            capturedByWhite: capturedPiece && prev.turn === COLORS.WHITE ? [...prev.capturedByWhite, capturedPiece] : prev.capturedByWhite,
            capturedByBlack: capturedPiece && prev.turn === COLORS.BLACK ? [...prev.capturedByBlack, capturedPiece] : prev.capturedByBlack,
            inCheck,
            lastMove: { from: [sr, sf], to: [r, f] },
          };
        }

        // Re-select or deselect
        if (sr === r && sf === f) return { ...prev, selectedSquare: null, legalMoves: [] };
      }

      // Select piece
      const piece = prev.board[r][f];
      if (piece && piece.color === prev.turn) {
        const moves = getLegalMoves(prev.board, r, f, prev.castlingRights, prev.enPassantTarget);
        return { ...prev, selectedSquare: [r, f], legalMoves: moves };
      }

      return { ...prev, selectedSquare: null, legalMoves: [] };
    });
  }, []);

  const handlePromotion = useCallback((pieceType) => {
    setGs(prev => {
      if (!prev.pendingPromotion) return prev;
      const { from, to } = prev.pendingPromotion;
      const [sr, sf] = from;
      const [r, f] = to;
      const piece = prev.board[sr][sf];
      const captured = prev.board[r][f];

      const { board: nb, enPassantTarget: newEP, castlingRights: newCR } =
        applyMove(prev.board, from, to, prev.enPassantTarget, prev.castlingRights, pieceType);

      const nextTurn = prev.turn === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
      const inCheck = isInCheck(nb, nextTurn);
      const result = detectGameResult(nb, nextTurn, newCR, newEP);
      const isMate = result === GAME_RESULT.CHECKMATE;

      const notation = toAlgebraic(prev.board, from, to, piece, captured, inCheck, isMate, null, pieceType);

      return {
        ...prev,
        board: nb,
        turn: nextTurn,
        castlingRights: newCR,
        enPassantTarget: newEP,
        selectedSquare: null,
        legalMoves: [],
        pendingPromotion: null,
        history: [...prev.history, { board: prev.board, turn: prev.turn, castlingRights: prev.castlingRights, enPassantTarget: prev.enPassantTarget, capturedByWhite: prev.capturedByWhite, capturedByBlack: prev.capturedByBlack }],
        moveHistory: [...prev.moveHistory, { notation, color: prev.turn, from, to }],
        gameResult: result,
        capturedByWhite: captured && prev.turn === COLORS.WHITE ? [...prev.capturedByWhite, captured] : prev.capturedByWhite,
        capturedByBlack: captured && prev.turn === COLORS.BLACK ? [...prev.capturedByBlack, captured] : prev.capturedByBlack,
        inCheck,
        lastMove: { from, to },
      };
    });
  }, []);

  const handleUndo = useCallback(() => {
    setGs(prev => {
      if (prev.history.length === 0) return prev;
      const last = prev.history[prev.history.length - 1];
      return {
        ...prev,
        board: last.board,
        turn: last.turn,
        castlingRights: last.castlingRights,
        enPassantTarget: last.enPassantTarget,
        selectedSquare: null,
        legalMoves: [],
        history: prev.history.slice(0, -1),
        moveHistory: prev.moveHistory.slice(0, -1),
        gameResult: GAME_RESULT.ONGOING,
        capturedByWhite: last.capturedByWhite,
        capturedByBlack: last.capturedByBlack,
        inCheck: false,
        lastMove: prev.history.length > 1 ? { from: prev.history[prev.history.length - 2]?.lastFrom, to: prev.history[prev.history.length - 2]?.lastTo } : null,
        pendingPromotion: null,
      };
    });
  }, []);

  const handleNewGame = useCallback((clockEnabled, clockConfig) => {
    clearInterval(clockRef.current);
    const secs = clockConfig * 60;
    setGs({ ...createInitialGameState(), clockEnabled: clockEnabled, clockConfig, clocks: { w: secs, b: secs } });
    setShowNewGameModal(false);
  }, []);

  const handleResign = useCallback(() => {
    setGs(prev => ({ ...prev, gameResult: GAME_RESULT.RESIGNED }));
  }, []);

  const handleFlip = useCallback(() => {
    setGs(prev => ({ ...prev, flipped: !prev.flipped }));
  }, []);

  // Board rendering helpers
  const { board, selectedSquare, legalMoves, lastMove, flipped, inCheck, gameResult, turn, pendingPromotion, clocks, clockEnabled, clockConfig } = gs;

  const kingSquare = gameResult === GAME_RESULT.ONGOING && inCheck ? findKing(board, turn) : null;

  function renderBoard() {
    const rows = [];
    for (let ri = 0; ri < 8; ri++) {
      const displayRank = flipped ? ri : 7 - ri;
      for (let fi = 0; fi < 8; fi++) {
        const displayFile = flipped ? 7 - fi : fi;
        const r = displayRank, f = displayFile;
        const piece = board[r][f];
        const isLight = (r + f) % 2 === 0;
        const isSelected = selectedSquare && selectedSquare[0] === r && selectedSquare[1] === f;
        const isLegal = legalMoves.some(([lr, lf]) => lr === r && lf === f);
        const isLastFrom = lastMove && lastMove.from[0] === r && lastMove.from[1] === f;
        const isLastTo = lastMove && lastMove.to[0] === r && lastMove.to[1] === f;
        const isCheckKing = kingSquare && kingSquare[0] === r && kingSquare[1] === f;

        let cls = `square ${isLight ? "light" : "dark"}`;
        if (isSelected) cls += " selected";
        else if (isLastFrom) cls += " last-from";
        else if (isLastTo) cls += " last-to";
        if (isCheckKing) cls += " in-check";

        const key = `${r}-${f}`;
        rows.push(
          <div key={key} className={cls} onClick={() => handleSquareTap(r, f)}>
            {isLegal && (
              <div className={`legal-dot${piece && !isSelected ? " capture" : ""}`} />
            )}
            {piece && (
              <span className={`piece ${piece.color === COLORS.WHITE ? "white-piece" : "black-piece"}`}>
                {PIECE_SYMBOLS[`${piece.color}${piece.type}`]}
              </span>
            )}
          </div>
        );
      }
    }
    return rows;
  }

  const rankLabels = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  const fileLabels = flipped ? ["h","g","f","e","d","c","b","a"] : ["a","b","c","d","e","f","g","h"];

  const whiteActive = turn === COLORS.WHITE && gameResult === GAME_RESULT.ONGOING;
  const blackActive = turn === COLORS.BLACK && gameResult === GAME_RESULT.ONGOING;

  // Move list grouped
  const movePairs = [];
  for (let i = 0; i < gs.moveHistory.length; i += 2) {
    movePairs.push({ w: gs.moveHistory[i], b: gs.moveHistory[i + 1] });
  }

  // Status text
  let statusText = turn === COLORS.WHITE ? "White to move" : "Black to move";
  let statusType = "active";
  if (inCheck && gameResult === GAME_RESULT.ONGOING) { statusText = `${turn === COLORS.WHITE ? "White" : "Black"} is in check!`; statusType = "danger"; }
  if (gameResult === GAME_RESULT.STALEMATE) { statusText = "Stalemate — Draw"; statusType = "inactive"; }
  if (gameResult === GAME_RESULT.CHECKMATE) {
    const winner = turn === COLORS.WHITE ? "Black" : "White";
    statusText = `Checkmate — ${winner} wins!`; statusType = "danger";
  }
  if (gameResult === GAME_RESULT.RESIGNED) {
    const winner = turn === COLORS.WHITE ? "Black" : "White";
    statusText = `${turn === COLORS.WHITE ? "White" : "Black"} resigned — ${winner} wins`; statusType = "inactive";
  }

  const gameOver = gameResult !== GAME_RESULT.ONGOING;

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header>
          <div className="logo">
            ♟ Chess <span>2-Player</span>
          </div>
          <div className="header-badge">Human vs Human</div>
        </header>

        <div className="main-layout">
          {/* Left Panel */}
          <div className="left-panel">
            <div className={`player-card ${flipped ? (blackActive ? "active" : "") : (whiteActive ? "active" : "")}`}>
              {flipped ? (
                <>
                  <div className="player-avatar black-avatar">♟</div>
                  <div>
                    <div className="player-name">Black</div>
                    <div className="player-label">Player 2</div>
                  </div>
                  {clockEnabled && <div className={`player-clock${clocks.b < 30 ? " warning" : ""}`}>{formatClock(clocks.b)}</div>}
                </>
              ) : (
                <>
                  <div className="player-avatar white-avatar">♙</div>
                  <div>
                    <div className="player-name">White</div>
                    <div className="player-label">Player 1</div>
                  </div>
                  {clockEnabled && <div className={`player-clock${clocks.w < 30 ? " warning" : ""}`}>{formatClock(clocks.w)}</div>}
                </>
              )}
            </div>

            <div className="panel-card">
              <div className="panel-label">Captured</div>
              <div className="captured-pieces">
                {(flipped ? gs.capturedByBlack : gs.capturedByWhite).map((p, i) => (
                  <span key={i}>{PIECE_SYMBOLS[`${p.color}${p.type}`]}</span>
                ))}
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-label">Controls</div>
              <div className="controls">
                <button className="btn" onClick={handleUndo} disabled={gs.history.length === 0 || gameOver}>↩ Undo</button>
                <button className="btn" onClick={handleFlip}>⇅ Flip</button>
                <button className="btn danger" onClick={handleResign} disabled={gameOver}>⚐ Resign</button>
                <button className="btn accent" onClick={() => setShowNewGameModal(true)}>New Game</button>
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-label">Clock</div>
              <select className="clock-select" value={clockConfig} onChange={e => {}} disabled>
                <option value={1}>1+0 Bullet</option>
                <option value={3}>3+0 Blitz</option>
                <option value={5}>5+0 Blitz</option>
                <option value={10}>10+0 Rapid</option>
              </select>
              <div style={{fontSize:"0.62rem",color:"var(--text-dim)",marginTop:6}}>{clockEnabled ? "Clock active" : "No clock — set on new game"}</div>
            </div>
          </div>

          {/* Board */}
          <div className="board-wrapper">
            <div className="board-container">
              <div className="board-grid-wrap">
                <div className="rank-coords">
                  {rankLabels.map(n => <div key={n} className="rank-coord">{n}</div>)}
                </div>
                <div className="board">{renderBoard()}</div>
              </div>
            </div>
            <div className="coords-row">
              {fileLabels.map(f => <div key={f} className="coord-cell">{f}</div>)}
            </div>

            <div className="status-bar">
              <div className={`status-dot ${statusType}`} />
              {gameOver
                ? <span className="status-result">{statusText}</span>
                : <span className="status-text">{statusText}</span>
              }
              <span style={{marginLeft:"auto",fontSize:"0.62rem",color:"var(--text-dim)"}}>
                Move {Math.ceil((gs.moveHistory.length + 1) / 2)}
              </span>
            </div>
          </div>

          {/* Right Panel */}
          <div className="right-panel">
            <div className={`player-card ${flipped ? (whiteActive ? "active" : "") : (blackActive ? "active" : "")}`}>
              {flipped ? (
                <>
                  <div className="player-avatar white-avatar">♙</div>
                  <div>
                    <div className="player-name">White</div>
                    <div className="player-label">Player 1</div>
                  </div>
                  {clockEnabled && <div className={`player-clock${clocks.w < 30 ? " warning" : ""}`}>{formatClock(clocks.w)}</div>}
                </>
              ) : (
                <>
                  <div className="player-avatar black-avatar">♟</div>
                  <div>
                    <div className="player-name">Black</div>
                    <div className="player-label">Player 2</div>
                  </div>
                  {clockEnabled && <div className={`player-clock${clocks.b < 30 ? " warning" : ""}`}>{formatClock(clocks.b)}</div>}
                </>
              )}
            </div>

            <div className="panel-card">
              <div className="panel-label">Captured</div>
              <div className="captured-pieces">
                {(flipped ? gs.capturedByWhite : gs.capturedByBlack).map((p, i) => (
                  <span key={i}>{PIECE_SYMBOLS[`${p.color}${p.type}`]}</span>
                ))}
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-label">Move History</div>
              <div className="move-list">
                {movePairs.length === 0 && <div style={{color:"var(--text-dim)",fontSize:"0.7rem"}}>No moves yet</div>}
                {movePairs.map((pair, i) => (
                  <div key={i} className="move-row">
                    <span className="move-num">{i + 1}.</span>
                    <span className="move-w">{pair.w?.notation || ""}</span>
                    <span className="move-b">{pair.b?.notation || ""}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-card" style={{fontSize:"0.68rem",color:"var(--text-dim)",lineHeight:1.8}}>
              <div className="panel-label">How to Play</div>
              <div>Tap a piece to select it</div>
              <div>Tap a dot to move</div>
              <div>Tap same piece to deselect</div>
              <div>Yellow = last move</div>
              <div>Green = selected</div>
              <div>Red = king in check</div>
            </div>
          </div>
        </div>

        {/* Promotion Modal */}
        {pendingPromotion && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>Promote Pawn</h2>
              <p>Choose a piece for your pawn</p>
              <div className="promo-options">
                {[PIECE_TYPES.QUEEN, PIECE_TYPES.ROOK, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT].map(pt => {
                  const color = turn;
                  return (
                    <button key={pt} className="promo-btn" onClick={() => handlePromotion(pt)}>
                      <span style={{ color: color === COLORS.WHITE ? "var(--w-piece)" : "var(--b-piece)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))" }}>
                        {PIECE_SYMBOLS[`${color}${pt}`]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Game Over Modal */}
        {gameOver && !showNewGameModal && (
          <div className="modal-overlay" onClick={() => setShowNewGameModal(true)}>
            <div className="gameover-modal" onClick={e => e.stopPropagation()}>
              <div className="gameover-icon">
                {gameResult === GAME_RESULT.CHECKMATE ? "♟" : gameResult === GAME_RESULT.STALEMATE ? "🤝" : "⚐"}
              </div>
              <div className="gameover-title">
                {gameResult === GAME_RESULT.CHECKMATE
                  ? `${turn === COLORS.WHITE ? "Black" : "White"} Wins!`
                  : gameResult === GAME_RESULT.STALEMATE
                    ? "It's a Draw"
                    : `${turn === COLORS.WHITE ? "Black" : "White"} Wins`}
              </div>
              <div className="gameover-sub">
                {gameResult === GAME_RESULT.CHECKMATE && "by Checkmate"}
                {gameResult === GAME_RESULT.STALEMATE && "by Stalemate — no legal moves"}
                {gameResult === GAME_RESULT.RESIGNED && `${turn === COLORS.WHITE ? "White" : "Black"} resigned`}
                <br/>
                {gs.moveHistory.length} moves played
              </div>
              <div className="gameover-actions">
                <button className="btn accent" onClick={() => handleNewGame(false, 10)}>New Game</button>
                <button className="btn" onClick={() => setShowNewGameModal(true)}>With Clock</button>
              </div>
            </div>
          </div>
        )}

        {/* New Game Modal */}
        {showNewGameModal && (
          <NewGameModal onStart={handleNewGame} onClose={() => setShowNewGameModal(false)} />
        )}
      </div>
    </>
  );
}

// ─── New Game Modal ───────────────────────────────────────────────────────────
function NewGameModal({ onStart, onClose }) {
  const [clockEnabled, setClockEnabled] = useState(false);
  const [clockConfig, setClockConfig] = useState(10);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{minWidth:300}} onClick={e => e.stopPropagation()}>
        <h2 style={{marginBottom:8}}>New Game</h2>
        <p style={{marginBottom:20}}>Configure your game settings</p>

        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:22}}>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:"0.78rem"}}>
            <input type="checkbox" checked={clockEnabled} onChange={e => setClockEnabled(e.target.checked)}
              style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer"}} />
            <span>Enable Chess Clock</span>
          </label>

          {clockEnabled && (
            <div>
              <div style={{fontSize:"0.62rem",color:"var(--text-dim)",marginBottom:8,letterSpacing:"0.1em",textTransform:"uppercase"}}>Time Control</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                {[1,3,5,10,15,30].map(t => (
                  <button key={t} className={`btn${clockConfig===t?" accent":""}`}
                    onClick={() => setClockConfig(t)} style={{padding:"6px 12px"}}>
                    {t < 5 ? `${t}+0` : `${t}min`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="divider" style={{marginBottom:18}} />
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn accent" onClick={() => onStart(clockEnabled, clockConfig)}>Start Game</button>
        </div>
      </div>
    </div>
  );
}
