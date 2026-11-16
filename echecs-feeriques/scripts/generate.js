// Génère puzzles.js : node scripts/generate.js [graine]
// Chaque problème est vérifié par recherche exhaustive.
'use strict';
const E = require('../engine.js');
const fs = require('fs');
const path = require('path');

let seed = Number(process.argv[2] || 7);
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];

// Équivalent classique : si la pièce remplacée par ceci mate encore, le problème n'est pas thématique.
const ANALOG = { G: null, C: null, Z: null, O: null, H: 'N', S: 'B', E: 'R', A: 'Q' };

const CHAPTERS = [
  { id: 'G', mates: [1, 1, 1, 2, 2] },
  { id: 'C', mates: [1, 1, 2, 2, 2] },
  { id: 'Z', mates: [1, 1, 2, 2, 2] },
  { id: 'H', mates: [1, 1, 2, 2, 2] },
  { id: 'S', mates: [1, 2, 2, 2, 2] },
  { id: 'E', mates: [1, 2, 2, 2, 2] },
  { id: 'O', mates: [1, 1, 2, 2, 2] },
  { id: 'A', mates: [1, 2, 2, 2, 2] },
  { id: 'bal', fairies: 2, mates: [1, 2, 2, 2, 2] },
];

function randomPosition(fairies, n) {
  const b = new Array(64).fill(null);
  const free = () => { let s; do s = Math.floor(rnd() * 64); while (b[s]); return s; };
  // Roi noir plutôt au bord
  let bk;
  do bk = Math.floor(rnd() * 64); while (rnd() < 0.7 && ![0, 7].includes(E.fileOf(bk)) && ![0, 7].includes(E.rankOf(bk)));
  b[bk] = 'k';
  let wk;
  do wk = free(); while (Math.max(Math.abs(E.fileOf(wk) - E.fileOf(bk)), Math.abs(E.rankOf(wk) - E.rankOf(bk))) < 2);
  b[wk] = 'K';
  const kangaW = fairies.includes('O');
  const extraW = kangaW ? 1 + Math.floor(rnd() * 3) : Math.floor(rnd() * (n === 1 ? 2 : 3));
  for (let i = 0; i < extraW; i++) {
    const t = kangaW ? pick(['P', 'P', 'P', 'N']) : pick(['P', 'P', 'N', 'B', 'R']);
    let s; do s = free(); while (t === 'P' && (E.rankOf(s) < 1 || E.rankOf(s) > 4));
    b[s] = t;
  }
  const hopper = fairies.some(f => f === 'G' || f === 'O');
  const kanga = fairies.includes('O');
  const extraB = kanga ? 3 + Math.floor(rnd() * 5) : 1 + Math.floor(rnd() * (hopper ? 5 : 4));
  const near = s => Math.max(Math.abs(E.fileOf(s) - E.fileOf(bk)), Math.abs(E.rankOf(s) - E.rankOf(bk))) <= 2;
  for (let i = 0; i < extraB; i++) {
    const t = pick(['p', 'p', 'p', 'n', 'b', 'r']);
    let s, guard = 0;
    do s = free(); while ((t === 'p' && (E.rankOf(s) < 3 || E.rankOf(s) > 6)) || (rnd() < 0.85 && !near(s) && guard++ < 50));
    b[s] = t;
  }
  // Pièces féeriques en dernier, de préférence sur une case d'où elles peuvent donner échec.
  for (const f of fairies) {
    const good = [];
    for (let s = 0; s < 64; s++) {
      if (b[s]) continue;
      b[s] = f;
      if (E.targets(b, s).some(t => { if (b[t]) return false; const nb = b.slice(); nb[t] = f; nb[s] = null; return E.attacked(nb, bk, 'w'); })) good.push(s);
      b[s] = null;
    }
    b[good.length && rnd() < 0.85 ? pick(good) : free()] = f;
  }
  return { b, turn: 'w' };
}

function valid(pos) {
  if (E.inCheck(pos)) return false;                       // blanc en échec
  if (E.inCheck({ b: pos.b, turn: 'b' })) return false;   // noir déjà en échec : position illégale
  return true;
}

// Le roi noir a-t-il beaucoup de cases de fuite ? Filtre rapide.
function escapes(pos) {
  const k = E.kingSq(pos.b, 'b');
  return E.targets(pos.b, k).filter(s => !E.attacked(pos.b, s, 'w')).length;
}

function withReplaced(pos, from, to) {
  return { b: pos.b.map(p => (p === from ? to : p)), turn: pos.turn };
}

function evaluate(pos, n, fairies) {
  if (!valid(pos)) return null;
  if (escapes(pos) > 3) return null;
  for (let k = 1; k < n; k++) if (E.canMate(pos, k)) return null;
  const ks = E.keys(pos, n);
  if (ks.length !== 1) return null;
  const key = ks[0];
  // Pièce féerique indispensable
  for (const f of fairies) {
    const alt = withReplaced(pos, f, ANALOG[f]);
    if (E.canMate(alt, n)) return null;
  }
  const keyPiece = pos.b[key.from];
  const after = E.makeMove(pos, key);
  // Ligne principale : meilleure défense puis mat
  let mateBy = keyPiece, line = [E.moveName(pos, key)];
  if (n > 1) {
    const def = E.bestDefense(after, n - 1);
    const p2 = E.makeMove(after, def);
    const mates = E.keys(p2, n - 1);
    mateBy = p2.b[mates[0].from];
    line.push(E.moveName(after, def), E.moveName(p2, mates[0]));
  }
  if (!fairies.includes(keyPiece) && !fairies.includes(mateBy)) return null;
  if (n === 1 && !fairies.includes(keyPiece)) return null;
  let score = 0;
  const check = E.inCheck(after), capture = !!pos.b[key.to];
  if (n > 1 && !check) score += 3;
  if (!capture) score += 2;
  if (fairies.includes(keyPiece)) score += 2;
  const count = pos.b.filter(Boolean).length;
  score -= Math.max(0, count - 5) * 0.7;
  score += Math.min(E.legalMoves(after).length, 8) * 0.2;
  return { fen: E.toFEN(pos), n, score, line, kingSq: E.kingSq(pos.b, 'b') };
}

const ALL_FAIRIES = ['G', 'C', 'Z', 'H', 'S', 'E', 'O', 'A'];
module.exports = { randomPosition, evaluate, localSearch, heuristic, mutate };
const wt = require('worker_threads');
if (!wt.isMainThread) {
  seed = wt.workerData.seed;
  wt.parentPort.postMessage(generateChapter(CHAPTERS.find(c => c.id === wt.workerData.id)));
} else if (require.main === module) main();

// ---------- Recherche locale ----------
// h = nombre de défenses noires qui échappent au mat après le meilleur coup blanc (0 = mat en n trouvé).
function fairyMates(pos, fairies) {
  return E.legalMoves(pos).some(m => fairies.includes(pos.b[m.from]) && E.isMate(E.makeMove(pos, m)));
}

function heuristic(pos, n, fairies) {
  let best = Infinity;
  for (const m of E.legalMoves(pos)) {
    const a = E.makeMove(pos, m);
    const replies = E.legalMoves(a);
    if (n === 1) {
      if (!fairies.includes(pos.b[m.from]) || !E.inCheck(a)) continue;
      best = Math.min(best, replies.length);
    } else {
      if (!replies.length) continue;
      let esc = 0;
      for (const r of replies) { if (!fairyMates(E.makeMove(a, r), fairies)) { esc++; if (esc >= best) break; } }
      best = Math.min(best, esc);
    }
    if (best === 0) break;
  }
  // Pénalité si un mat plus court existe : le problème serait trivial.
  if (n > 1 && best < Infinity && E.canMate(pos, n - 1)) best += 1;
  return best;
}

function mutate(pos, fairies) {
  const b = pos.b.slice();
  const occ = [], empty = [];
  for (let s = 0; s < 64; s++) (b[s] ? occ : empty).push(s);
  const okPawn = (t, s) => t === 'P' ? E.rankOf(s) >= 1 && E.rankOf(s) <= 4 : t === 'p' ? E.rankOf(s) >= 3 && E.rankOf(s) <= 6 : true;
  const r = rnd();
  if (r < 0.55) { // déplacer une pièce (roi compris)
    const from = pick(occ), to = pick(empty), t = b[from];
    if (!okPawn(t, to)) return null;
    b[to] = t; b[from] = null;
  } else if (r < 0.75) { // ajouter une pièce
    if (occ.length >= 11) return null;
    const t = pick(['p', 'p', 'p', 'n', 'b', 'r', 'P', 'P', 'N', 'B']);
    const to = pick(empty);
    if (!okPawn(t, to)) return null;
    b[to] = t;
  } else { // retirer une pièce
    const s = pick(occ), t = b[s];
    if (t === 'K' || t === 'k' || fairies.includes(t)) return null;
    b[s] = null;
  }
  const np = { b, turn: 'w' };
  const wk = E.kingSq(b, 'w'), bk = E.kingSq(b, 'b');
  if (Math.max(Math.abs(E.fileOf(wk) - E.fileOf(bk)), Math.abs(E.rankOf(wk) - E.rankOf(bk))) < 2) return null;
  if (!valid(np)) return null;
  return np;
}

// Départ construit pour le kangourou : il a un coup qui donne échec.
function kangarooStart() {
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const H = () => pick(['p', 'p', 'P', 'P', 'n', 'b', 'N']);
  for (let tries = 0; tries < 200; tries++) {
    const b = new Array(64).fill(null);
    const bk = Math.floor(rnd() * 64);
    b[bk] = 'k';
    const at = (s, d, k) => { const f = E.fileOf(s) + d[0] * k, r = E.rankOf(s) + d[1] * k; return f >= 0 && f < 8 && r >= 0 && r < 8 ? E.sq(f, r) : -1; };
    // ligne d'échec : roi <- obstacle (adjacent) <- obstacle (j) <- X (m)
    const d = pick(DIRS), j = 2 + Math.floor(rnd() * 2), m = j + 1 + Math.floor(rnd() * 2);
    const h2 = at(bk, d, -1), h1 = at(bk, d, -j), X = at(bk, d, -m);
    if (h2 < 0 || h1 < 0 || X < 0) continue;
    // arrivée en X : obstacle adjacent à X, un autre plus loin, départ Y derrière
    const e = pick(DIRS);
    const g2 = at(X, e, -1), g1 = at(X, e, -2 - Math.floor(rnd() * 2)), Y = at(g1 < 0 ? X : g1, e, -1);
    if (g2 < 0 || g1 < 0 || Y < 0) continue;
    const cells = [h2, h1, X, g2, g1, Y];
    if (new Set(cells).size !== 6 || cells.includes(bk)) continue;
    // le chemin de Y à X ne doit contenir que g1 et g2 ; celui de X au roi que h1 et h2 (vérifié plus bas par le moteur)
    b[h2] = H(); b[h1] = H(); b[g2] = H(); b[g1] = H(); b[Y] = 'O';
    if (cells.some(c => b[c] && (b[c] === 'p' || b[c] === 'P') && (E.rankOf(c) === 0 || E.rankOf(c) === 7))) continue;
    let wk, g = 0;
    do wk = Math.floor(rnd() * 64); while ((b[wk] || wk === X || Math.max(Math.abs(E.fileOf(wk) - E.fileOf(bk)), Math.abs(E.rankOf(wk) - E.rankOf(bk))) < 2) && g++ < 100);
    if (b[wk]) continue;
    b[wk] = 'K';
    const pos = { b, turn: 'w' };
    if (!valid(pos)) continue;
    if (!E.legalMoves(pos).some(mv => mv.from === Y && mv.to === X)) continue;
    if (!E.inCheck(E.makeMove(pos, { from: Y, to: X }))) continue;
    return pos;
  }
  return null;
}

function localSearch(fairies, n) {
  let pos;
  if (fairies.length === 1 && fairies[0] === 'O') {
    // mat en 2 : on part d'un mat en 1 trouvé, qu'on « éloigne » ensuite
    pos = n > 1 ? localSearch(fairies, 1) : kangarooStart();
    if (!pos) return null;
  }
  else do pos = randomPosition(fairies, n); while (!valid(pos));
  let h = heuristic(pos, n, fairies);
  for (let step = 0; step < 800 && h > 0; step++) {
    const c = mutate(pos, fairies);
    if (!c) continue;
    const hc = heuristic(c, n, fairies);
    if (hc <= h) { pos = c; h = hc; }
  }
  return h === 0 ? pos : null;
}

function generateChapter(ch) {
  const list = [], used = new Set();
  const t0 = Date.now();
  for (const n of ch.mates) {
    let best = null, tries = 0, found = 0;
    const want = n === 1 ? 10 : 5;
    while (found < want && tries < 3000000) {
      tries++;
      const fairies = ch.fairies ? (() => { const a = pick(ALL_FAIRIES); let b; do b = pick(ALL_FAIRIES); while (b === a); return [a, b]; })() : [ch.id];
      const cand = localSearch(fairies, n);
      const r = cand && evaluate(cand, n, fairies);
      if (!r || used.has(r.fen)) continue;
      if (list.some(p => p.kingSq === r.kingSq)) r.score -= 2;
      found++;
      if (!best || r.score > best.score) best = r;
    }
    if (!best) throw new Error('Rien trouvé ' + ch.id + ' mat en ' + n);
    used.add(best.fen);
    list.push(best);
    console.error(ch.id, 'mat en', n, best.fen, best.line.join(' '), 'score', best.score.toFixed(1), tries, 'essais', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  return list.map(({ fen, n, line }) => ({ fen, n, line }));
}

function main() {
  const { Worker } = require('worker_threads');
  const base = Number(process.argv[2] || 7);
  const result = {};
  const t0 = Date.now();
  let next = 0, running = 0;
  const startOne = () => {
    if (next >= CHAPTERS.length) { if (!running) finish(); return; }
    const ch = CHAPTERS[next++]; running++;
    const w = new Worker(__filename, { workerData: { id: ch.id, seed: base * 1000 + next } });
    w.on('message', list => { result[ch.id] = list; });
    w.on('error', e => { console.error(e.message); process.exit(1); });
    w.on('exit', () => { running--; startOne(); });
  };
  const finish = () => {
    const ordered = {};
    for (const ch of CHAPTERS) ordered[ch.id] = result[ch.id];
    const out = '// Généré par scripts/generate.js — ne pas modifier à la main.\n' +
      'const PUZZLES = ' + JSON.stringify(ordered, null, 1) + ';\n' +
      "if (typeof module !== 'undefined') module.exports = PUZZLES;\n";
    fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), out);
    console.error('OK', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  };
  for (let k = 0; k < Math.min(4, CHAPTERS.length); k++) startOne();
}
