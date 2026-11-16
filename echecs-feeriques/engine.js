// Moteur d'échecs féeriques : génération des coups légaux et recherche de mat.
// Pièces (majuscule = blanc, minuscule = noir) :
//   K roi, Q dame, R tour, B fou, N cavalier, P pion
//   G sauterelle, C chameau, Z zèbre, H noctambule, S princesse,
//   E impératrice, O kangourou, A amazone
// Case : index 0..63, case = rang * 8 + colonne (a1 = 0, h8 = 63).
(function (root) {
  'use strict';

  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ROYAL = ORTH.concat(DIAG);
  const leaper = (a, b) => {
    const s = new Set();
    for (const [x, y] of [[a, b], [b, a]])
      for (const sx of [1, -1]) for (const sy of [1, -1]) s.add((x * sx) + ',' + (y * sy));
    return [...s].map(k => k.split(',').map(Number));
  };
  const KNIGHT = leaper(1, 2), CAMEL = leaper(1, 3), ZEBRA = leaper(2, 3);

  // Chaque type : liste de composantes { kind, dirs }
  //   leap : saut direct ; ride : glissement ; hop : sauteur (n obstacles)
  const TYPES = {
    K: [{ kind: 'leap', dirs: ROYAL }],
    Q: [{ kind: 'ride', dirs: ROYAL }],
    R: [{ kind: 'ride', dirs: ORTH }],
    B: [{ kind: 'ride', dirs: DIAG }],
    N: [{ kind: 'leap', dirs: KNIGHT }],
    G: [{ kind: 'hop', dirs: ROYAL, hurdles: 1 }],
    O: [{ kind: 'hop', dirs: ROYAL, hurdles: 2 }],
    C: [{ kind: 'leap', dirs: CAMEL }],
    Z: [{ kind: 'leap', dirs: ZEBRA }],
    H: [{ kind: 'ride', dirs: KNIGHT }],
    S: [{ kind: 'ride', dirs: DIAG }, { kind: 'leap', dirs: KNIGHT }],
    E: [{ kind: 'ride', dirs: ORTH }, { kind: 'leap', dirs: KNIGHT }],
    A: [{ kind: 'ride', dirs: ROYAL }, { kind: 'leap', dirs: KNIGHT }],
  };

  const isWhite = p => p >= 'A' && p <= 'Z';
  const colorOf = p => (p ? (isWhite(p) ? 'w' : 'b') : null);
  const typeOf = p => p.toUpperCase();
  const sq = (f, r) => r * 8 + f;
  const fileOf = s => s & 7;
  const rankOf = s => s >> 3;
  const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
  const name = s => 'abcdefgh'[fileOf(s)] + (rankOf(s) + 1);
  const parseSq = n => sq(n.charCodeAt(0) - 97, Number(n[1]) - 1);

  // Position : { b: tableau de 64 (null ou lettre), turn: 'w' | 'b' }
  function fromFEN(fen) {
    const [rows, turn] = fen.trim().split(/\s+/);
    const b = new Array(64).fill(null);
    rows.split('/').forEach((row, i) => {
      let f = 0; const r = 7 - i;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else { b[sq(f, r)] = ch; f++; }
      }
    });
    return { b, turn: turn || 'w' };
  }

  function toFEN(pos) {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', e = 0;
      for (let f = 0; f < 8; f++) {
        const p = pos.b[sq(f, r)];
        if (!p) e++;
        else { if (e) row += e; e = 0; row += p; }
      }
      if (e) row += e;
      rows.push(row);
    }
    return rows.join('/') + ' ' + pos.turn;
  }

  // Parcourt les cases atteignables par une pièce (hors pion), captures comprises.
  // cb(case) peut renvoyer true pour arrêter le parcours.
  function eachTarget(b, from, cb) {
    const p = b[from], c = colorOf(p);
    const f0 = fileOf(from), r0 = rankOf(from);
    for (const comp of TYPES[typeOf(p)]) {
      for (const [dx, dy] of comp.dirs) {
        if (comp.kind === 'leap') {
          const f = f0 + dx, r = r0 + dy;
          if (!onBoard(f, r)) continue;
          const t = b[r * 8 + f];
          if ((!t || colorOf(t) !== c) && cb(r * 8 + f)) return true;
        } else if (comp.kind === 'ride') {
          let f = f0 + dx, r = r0 + dy;
          while (onBoard(f, r)) {
            const t = b[r * 8 + f];
            if (!t) { if (cb(r * 8 + f)) return true; }
            else { if (colorOf(t) !== c && cb(r * 8 + f)) return true; break; }
            f += dx; r += dy;
          }
        } else { // hop : saute par-dessus exactement `hurdles` pièces, atterrit juste derrière la dernière
          let f = f0 + dx, r = r0 + dy, seen = 0;
          while (onBoard(f, r)) {
            const t = b[r * 8 + f];
            if (seen === comp.hurdles) {
              if ((!t || colorOf(t) !== c) && cb(r * 8 + f)) return true;
              break;
            }
            if (t) seen++;
            f += dx; r += dy;
          }
        }
      }
    }
    return false;
  }

  function targets(b, from) { const out = []; eachTarget(b, from, s => { out.push(s); }); return out; }

  function pawnMoves(b, from, out) {
    const p = b[from], white = isWhite(p), d = white ? 1 : -1;
    const f0 = fileOf(from), r0 = rankOf(from), last = white ? 7 : 0;
    const push = (to) => {
      if (rankOf(to) === last) for (const pr of 'QRBN') out.push({ from, to, promo: white ? pr : pr.toLowerCase() });
      else out.push({ from, to });
    };
    const r1 = r0 + d;
    if (r1 < 0 || r1 > 7) return;
    if (!b[sq(f0, r1)]) {
      push(sq(f0, r1));
      const start = white ? 1 : 6;
      if (r0 === start && !b[sq(f0, r0 + 2 * d)]) out.push({ from, to: sq(f0, r0 + 2 * d) });
    }
    for (const dx of [-1, 1]) {
      const f = f0 + dx;
      if (f < 0 || f > 7) continue;
      const t = b[sq(f, r1)];
      if (t && colorOf(t) !== colorOf(p)) push(sq(f, r1));
    }
  }

  function attacked(b, target, by) {
    const tf = fileOf(target), tr = rankOf(target);
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p || colorOf(p) !== by) continue;
      if (typeOf(p) === 'P') {
        if (tr === rankOf(s) + (by === 'w' ? 1 : -1) && Math.abs(tf - fileOf(s)) === 1) return true;
      } else if (eachTarget(b, s, t => t === target)) return true;
    }
    return false;
  }

  const kingSq = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
  const other = c => (c === 'w' ? 'b' : 'w');
  const inCheck = pos => { const k = kingSq(pos.b, pos.turn); return k >= 0 && attacked(pos.b, k, other(pos.turn)); };

  function makeMove(pos, m) {
    const b = pos.b.slice();
    b[m.to] = m.promo || b[m.from];
    b[m.from] = null;
    return { b, turn: other(pos.turn) };
  }

  function pseudoMoves(pos) {
    const out = [], c = pos.turn;
    for (let s = 0; s < 64; s++) {
      const p = pos.b[s];
      if (!p || colorOf(p) !== c) continue;
      if (typeOf(p) === 'P') pawnMoves(pos.b, s, out);
      else eachTarget(pos.b, s, to => { out.push({ from: s, to }); });
    }
    return out;
  }

  function isLegal(pos, m) {
    // Un roi ne peut jamais être capturé.
    if (pos.b[m.to] && typeOf(pos.b[m.to]) === 'K') return false;
    const nb = pos.b.slice();
    nb[m.to] = m.promo || nb[m.from]; nb[m.from] = null;
    const k = kingSq(nb, pos.turn);
    return k >= 0 && !attacked(nb, k, other(pos.turn));
  }

  const legalMoves = pos => pseudoMoves(pos).filter(m => isLegal(pos, m));
  const hasLegalMove = pos => pseudoMoves(pos).some(m => isLegal(pos, m));
  const isMate = pos => inCheck(pos) && !hasLegalMove(pos);

  // Le camp au trait peut-il mater en n coups au plus ?
  function canMate(pos, n) {
    const moves = legalMoves(pos);
    if (n === 1) return moves.some(m => isMate(makeMove(pos, m)));
    // On essaie d'abord les échecs : ils réduisent vite l'arbre.
    for (const m of moves) if (defenderLoses(makeMove(pos, m), n)) return true;
    return false;
  }

  // Le défenseur (au trait) est-il maté au plus tard au n-ième coup de l'attaquant ?
  function defenderLoses(pos, n) {
    const replies = legalMoves(pos);
    if (replies.length === 0) return inCheck(pos);
    if (n <= 1) return false;
    for (const r of replies) if (!canMate(makeMove(pos, r), n - 1)) return false;
    return true;
  }

  // Coups clés : coups de l'attaquant qui forcent le mat en n.
  const keys = (pos, n) => legalMoves(pos).filter(m => defenderLoses(makeMove(pos, m), n));

  // Plus petit k <= max tel que mat en k ; Infinity sinon.
  function mateDistance(pos, max) {
    for (let k = 1; k <= max; k++) if (canMate(pos, k)) return k;
    return Infinity;
  }

  // Meilleure défense : la réponse qui retarde le plus le mat.
  function bestDefense(pos, max) {
    const replies = legalMoves(pos);
    let best = [], bestD = -1;
    for (const r of replies) {
      const d = mateDistance(makeMove(pos, r), max);
      if (d > bestD) { bestD = d; best = [r]; } else if (d === bestD) best.push(r);
    }
    return best.length ? best[Math.floor(Math.random() * best.length)] : null;
  }

  const moveName = (pos, m) => {
    const p = pos.b[m.from];
    const t = typeOf(p);
    return (t === 'P' ? '' : t) + name(m.from) + (pos.b[m.to] ? 'x' : '-') + name(m.to) + (m.promo ? '=' + typeOf(m.promo) : '');
  };

  const api = { TYPES, fromFEN, toFEN, legalMoves, makeMove, inCheck, isMate, canMate, defenderLoses, keys,
    mateDistance, bestDefense, targets, attacked, colorOf, typeOf, name, parseSq, sq, fileOf, rankOf, moveName, kingSq };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(this);
