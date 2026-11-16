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
  for (const f of fairies) b[free()] = f;
  const extraW = Math.floor(rnd() * (n === 1 ? 2 : 3));
  for (let i = 0; i < extraW; i++) {
    const t = pick(['P', 'P', 'N', 'B', 'R']);
    let s; do s = free(); while (t === 'P' && (E.rankOf(s) < 1 || E.rankOf(s) > 4));
    b[s] = t;
  }
  const hopper = fairies.some(f => f === 'G' || f === 'O');
  const extraB = 1 + Math.floor(rnd() * (hopper ? 5 : 4));
  const near = s => Math.max(Math.abs(E.fileOf(s) - E.fileOf(bk)), Math.abs(E.rankOf(s) - E.rankOf(bk))) <= 2;
  for (let i = 0; i < extraB; i++) {
    const t = pick(['p', 'p', 'p', 'n', 'b', 'r']);
    let s, guard = 0;
    do s = free(); while ((t === 'p' && (E.rankOf(s) < 3 || E.rankOf(s) > 6)) || (rnd() < 0.85 && !near(s) && guard++ < 50));
    b[s] = t;
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
module.exports = { randomPosition, evaluate };
if (require.main === module) main();

function main() {
const result = {};
const t0 = Date.now();
for (const ch of CHAPTERS) {
  const list = [];
  const used = new Set();
  for (const n of ch.mates) {
    let best = null, tries = 0, found = 0;
    const want = n === 1 ? 12 : 6;
    while (found < want && tries < 3000000) {
      tries++;
      const fairies = ch.fairies ? (() => { const a = pick(ALL_FAIRIES); let b; do b = pick(ALL_FAIRIES); while (b === a); return [a, b]; })() : [ch.id];
      const pos = randomPosition(fairies, n);
      const r = evaluate(pos, n, fairies);
      if (!r || used.has(r.fen)) continue;
      // diversité : éviter la même case du roi noir que les autres problèmes du chapitre
      if (list.some(p => p.kingSq === r.kingSq)) r.score -= 2;
      found++;
      if (!best || r.score > best.score) best = r;
    }
    if (!best) { console.error('Rien trouvé', ch.id, n); process.exit(1); }
    used.add(best.fen);
    list.push(best);
    console.error(ch.id, 'mat en', n, best.fen, best.line.join(' '), 'score', best.score.toFixed(1), tries, 'essais', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  result[ch.id] = list.map(({ fen, n, line }) => ({ fen, n, line }));
}

const out = '// Généré par scripts/generate.js — ne pas modifier à la main.\n' +
  'const PUZZLES = ' + JSON.stringify(result, null, 1) + ';\n' +
  "if (typeof module !== 'undefined') module.exports = PUZZLES;\n";
fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), out);
console.error('OK', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
