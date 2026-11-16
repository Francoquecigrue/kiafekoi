// Revérifie puzzles.js : node scripts/verify.js
'use strict';
const E = require('../engine.js');
const PUZZLES = require('../puzzles.js');
let errors = 0, count = 0;
for (const [ch, list] of Object.entries(PUZZLES)) {
  list.forEach((p, i) => {
    count++;
    const pos = E.fromFEN(p.fen);
    const fail = msg => { errors++; console.log(`${ch}#${i + 1} ${p.fen} : ${msg}`); };
    if (E.inCheck({ b: pos.b, turn: 'b' })) fail('noir en échec au départ');
    for (let k = 1; k < p.n; k++) if (E.canMate(pos, k)) fail(`mat plus court (${k})`);
    const ks = E.keys(pos, p.n);
    if (ks.length !== 1) fail(`${ks.length} clés : ${ks.map(m => E.moveName(pos, m)).join(', ')}`);
  });
}
console.log(`${count} problèmes vérifiés, ${errors} erreur(s).`);
process.exit(errors ? 1 : 0);
