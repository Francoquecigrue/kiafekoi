'use strict';
const E = Engine;
const $ = id => document.getElementById(id);

// ---------- Sauvegarde ----------
const KEY = 'menagerie-v1';
const save = () => localStorage.setItem(KEY, JSON.stringify(progress));
let progress = (() => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
})();
progress.solved = progress.solved || {};
progress.intro = progress.intro || {};

const chapterPuzzles = i => PUZZLES[PIECES[i].id];
const solvedList = i => progress.solved[PIECES[i].id] || [];
const solvedCount = i => solvedList(i).filter(Boolean).length;
const chapterDone = i => solvedCount(i) === chapterPuzzles(i).length;
const unlocked = i => i === 0 || chapterDone(i - 1);
const firstUnsolved = i => { const s = solvedList(i); const n = chapterPuzzles(i).length; for (let k = 0; k < n; k++) if (!s[k]) return k; return 0; };

// ---------- Écrans ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { renderHome(); show('screen-home'); }));

function renderHome() {
  const box = $('chapters');
  box.innerHTML = '';
  let currentMarked = false;
  PIECES.forEach((p, i) => {
    const open = unlocked(i), done = chapterDone(i);
    const el = document.createElement('button');
    el.className = 'chapter' + (open ? '' : ' locked') + (done ? ' done' : '');
    if (open && !done && !currentMarked) { el.classList.add('current'); currentMarked = true; }
    const total = chapterPuzzles(i).length;
    el.innerHTML = open
      ? `<span class="ic">${p.icon}</span><span class="txt"><b>${p.name}</b><small>${p.short}</small></span><span class="prog">${done ? '✓ ' : ''}${solvedCount(i)}/${total}</span>`
      : `<span class="ic">🔒</span><span class="txt"><b>???</b><small>Pièce mystère</small></span><span class="prog">0/${total}</span>`;
    if (open) el.addEventListener('click', () => openChapter(i));
    box.appendChild(el);
  });
}

function openChapter(i) {
  if (!progress.intro[PIECES[i].id]) showIntro(i);
  else openPuzzle(i, firstUnsolved(i));
}

// ---------- Fiche d'une pièce ----------
let introBoard = null;
function showIntro(i) {
  const p = PIECES[i];
  $('intro-kicker').textContent = progress.intro[p.id] ? 'Fiche' : 'Nouvelle pièce';
  $('intro-icon').textContent = p.icon;
  $('intro-name').textContent = p.name;
  $('intro-rules').innerHTML = p.rules;
  $('intro-tip').textContent = p.tip;
  const hasDemo = !!p.demo;
  $('intro-board').classList.toggle('hidden', !hasDemo);
  $('intro-legend').classList.toggle('hidden', !hasDemo);
  if (hasDemo) {
    introBoard = E.fromFEN(p.demo);
    drawIntro(E.parseSq('d4'));
  }
  $('btn-intro-go').onclick = () => {
    progress.intro[p.id] = true; save();
    openPuzzle(i, firstUnsolved(i));
  };
  show('screen-intro');
}

function drawIntro(at) {
  const b = introBoard.b;
  const dots = E.targets(b, at).map(to => ({ to, cap: !!b[to] }));
  drawBoard($('intro-board'), introBoard, { dots, sel: at, onTap: s => {
    if (b[s]) return;
    b[s] = b[at]; b[at] = null;
    drawIntro(s);
  } });
}

// ---------- Dessin de l'échiquier ----------
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const pct = v => (v * 12.5) + '%';

function pieceHTML(p) {
  const t = E.typeOf(p);
  if (GLYPH[t]) return `<span class="g">${GLYPH[t]}︎</span>`;
  return `<span class="fairy">${PIECE_BY_ID[t].icon}</span>`;
}

function drawBoard(el, pos, o = {}) {
  el.innerHTML = '';
  for (let s = 0; s < 64; s++) {
    const f = E.fileOf(s), r = E.rankOf(s);
    const d = document.createElement('div');
    d.className = 'sq ' + ((f + r) % 2 ? 'l' : 'd');
    if (o.last && (o.last.from === s || o.last.to === s)) d.classList.add('last');
    if (o.sel === s) d.classList.add('sel');
    if (o.hint && o.hint.includes(s)) d.classList.add('hint');
    if (o.check === s) d.classList.add('check');
    d.style.left = pct(f); d.style.top = pct(7 - r);
    if (r === 0) d.innerHTML += `<span class="coord f">${'abcdefgh'[f]}</span>`;
    if (f === 0) d.innerHTML += `<span class="coord r">${r + 1}</span>`;
    el.appendChild(d);
  }
  el._pcs = {};
  for (let s = 0; s < 64; s++) {
    const p = pos.b[s];
    if (!p) continue;
    const d = document.createElement('div');
    d.className = 'pc ' + E.colorOf(p);
    d.style.left = pct(E.fileOf(s)); d.style.top = pct(7 - E.rankOf(s));
    d.innerHTML = pieceHTML(p);
    el.appendChild(d);
    el._pcs[s] = d;
  }
  for (const { to, cap } of o.dots || []) {
    const d = document.createElement('div');
    d.className = 'dot' + (cap ? ' cap' : '');
    d.style.left = pct(E.fileOf(to)); d.style.top = pct(7 - E.rankOf(to));
    el.appendChild(d);
  }
  el.onpointerdown = ev => {
    if (!o.onTap) return;
    const rect = el.getBoundingClientRect();
    const f = Math.floor((ev.clientX - rect.left) / rect.width * 8);
    const r = 7 - Math.floor((ev.clientY - rect.top) / rect.height * 8);
    if (f >= 0 && f < 8 && r >= 0 && r < 8) o.onTap(E.sq(f, r));
  };
}

// Fait glisser la pièce, puis appelle done.
function animate(el, m, done) {
  const pc = el._pcs && el._pcs[m.from];
  const victim = el._pcs && el._pcs[m.to];
  if (!pc) return done();
  if (victim) victim.classList.add('gone');
  pc.style.zIndex = 5;
  pc.style.left = pct(E.fileOf(m.to)); pc.style.top = pct(7 - E.rankOf(m.to));
  setTimeout(done, 240);
}

// ---------- Problèmes ----------
let pz = null;

function openPuzzle(ch, idx) {
  const data = chapterPuzzles(ch)[idx];
  pz = { ch, idx, data, start: E.fromFEN(data.fen), pos: null, left: data.n, sel: null, last: null,
    busy: false, hint: null, hintLevel: 0, solved: false };
  resetPuzzle();
  show('screen-puzzle');
}

function resetPuzzle() {
  pz.pos = { b: pz.start.b.slice(), turn: 'w' };
  pz.left = pz.data.n; pz.sel = null; pz.last = null; pz.busy = false; pz.hint = null; pz.hintLevel = 0; pz.solved = false;
  const p = PIECES[pz.ch];
  $('pz-title').textContent = `${p.icon} ${p.name}`;
  $('pz-done').classList.add('hidden');
  $('btn-hint').disabled = false;
  $('btn-retry').disabled = false;
  setStatus('');
  renderDots();
  updateGoal();
  redraw();
}

function updateGoal() {
  $('pz-goal').textContent = pz.left === 1 ? 'Mat en 1' : `Mat en ${pz.left}`;
}

function renderDots() {
  const box = $('pz-dots');
  box.innerHTML = '';
  const s = solvedList(pz.ch);
  chapterPuzzles(pz.ch).forEach((_, k) => {
    const b = document.createElement('button');
    b.textContent = k + 1;
    if (s[k]) b.classList.add('solved');
    if (k === pz.idx) b.classList.add('cur');
    // On peut rejouer un problème résolu ou aller au prochain non résolu.
    b.disabled = !(s[k] || k === firstUnsolved(pz.ch) || k === pz.idx);
    b.addEventListener('click', () => openPuzzle(pz.ch, k));
    box.appendChild(b);
  });
}

function setStatus(text, cls = '') {
  const el = $('pz-status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

function legalFrom(s) { return E.legalMoves(pz.pos).filter(m => m.from === s); }

function redraw() {
  const dots = pz.sel != null ? legalFrom(pz.sel).map(m => ({ to: m.to, cap: !!pz.pos.b[m.to] })) : [];
  const k = E.kingSq(pz.pos.b, pz.pos.turn);
  drawBoard($('board'), pz.pos, {
    last: pz.last, sel: pz.sel, dots, hint: pz.hint,
    check: E.inCheck(pz.pos) ? k : null,
    onTap,
  });
}

function onTap(s) {
  if (pz.busy || pz.solved) return;
  const p = pz.pos.b[s];
  if (p && E.colorOf(p) === 'w') {
    pz.sel = pz.sel === s ? null : s;
    redraw();
    return;
  }
  if (pz.sel != null) {
    const moves = legalFrom(pz.sel).filter(m => m.to === s);
    if (moves.length) {
      const m = moves.find(x => !x.promo || E.typeOf(x.promo) === 'Q') || moves[0];
      playWhite(m);
      return;
    }
  }
  pz.sel = null;
  redraw();
}

function playWhite(m) {
  const before = pz.pos;
  const after = E.makeMove(before, m);
  pz.busy = true; pz.sel = null; pz.hint = null;
  redraw();
  animate($('board'), m, () => {
    pz.pos = after; pz.last = m;
    redraw();
    if (E.isMate(after)) return win();
    if (pz.left > 1 && E.defenderLoses(after, pz.left)) {
      pz.left--;
      setStatus('Bien vu ! Les Noirs répondent…', 'good');
      setTimeout(blackReply, 350);
      return;
    }
    // Mauvais coup : on montre pourquoi, puis on revient en arrière.
    const replies = E.legalMoves(after);
    let msg = 'Ce coup ne force pas le mat.';
    if (!replies.length) msg = 'Pat ! Les Noirs ne peuvent plus bouger, mais ne sont pas en échec.';
    else if (pz.left === 1) msg = E.inCheck(after) ? 'Échec, mais le roi noir s\'en sort.' : 'Pas de mat : le roi noir respire.';
    setStatus(msg, 'bad');
    $('board').classList.add('shake');
    setTimeout(() => {
      $('board').classList.remove('shake');
      pz.pos = before; pz.last = null; pz.busy = false;
      redraw();
    }, 1100);
  });
}

function blackReply() {
  const r = E.bestDefense(pz.pos, pz.left);
  if (!r) { pz.busy = false; return; }
  animate($('board'), r, () => {
    pz.pos = E.makeMove(pz.pos, r); pz.last = r; pz.busy = false;
    redraw();
    updateGoal();
    setStatus('À vous de jouer.');
  });
}

function onHint() {
  if (pz.busy || pz.solved) return;
  const ks = E.keys(pz.pos, pz.left);
  if (!ks.length) return;
  const m = ks[0];
  pz.hintLevel++;
  pz.hint = pz.hintLevel === 1 ? [m.from] : [m.from, m.to];
  setStatus(pz.hintLevel === 1 ? 'Cette pièce a un rôle à jouer…' : 'Le coup est indiqué.');
  redraw();
}

function win() {
  pz.solved = true; pz.busy = false;
  const id = PIECES[pz.ch].id;
  const wasDone = chapterDone(pz.ch);
  progress.solved[id] = progress.solved[id] || [];
  progress.solved[id][pz.idx] = true;
  save();
  setStatus('Échec et mat !', 'good');
  $('btn-hint').disabled = true;
  renderDots();
  const nowDone = chapterDone(pz.ch);
  const total = chapterPuzzles(pz.ch).length;
  const nextIdx = firstUnsolved(pz.ch);
  if (nowDone && !wasDone) {
    $('pz-done-text').textContent = `${PIECES[pz.ch].name} : chapitre terminé !`;
    $('btn-next').textContent = 'Continuer';
    $('btn-next').onclick = () => chapterReward(pz.ch);
  } else if (!nowDone) {
    $('pz-done-text').textContent = `Bravo ! (${solvedCount(pz.ch)}/${total})`;
    $('btn-next').textContent = 'Problème suivant';
    $('btn-next').onclick = () => openPuzzle(pz.ch, nextIdx);
  } else {
    $('pz-done-text').textContent = 'Bravo !';
    const nxt = pz.idx + 1 < total ? pz.idx + 1 : null;
    $('btn-next').textContent = nxt != null ? 'Problème suivant' : 'Retour à la ménagerie';
    $('btn-next').onclick = () => nxt != null ? openPuzzle(pz.ch, nxt) : (renderHome(), show('screen-home'));
  }
  $('pz-done').classList.remove('hidden');
}

function chapterReward(ch) {
  const next = PIECES[ch + 1];
  if (next) {
    modal(next.icon, 'Nouvelle pièce !', `Vous avez découvert : <b>${next.name}</b>.`, 'Faire connaissance', () => showIntro(ch + 1));
  } else {
    modal('🏆', 'Ménagerie complète', 'Vous avez dompté toutes les pièces féeriques. Bravo !', 'Retour', () => { renderHome(); show('screen-home'); });
  }
}

function modal(icon, title, html, btn, then, cancel = false) {
  $('modal-cancel').classList.toggle('hidden', !cancel);
  $('modal-cancel').onclick = () => $('modal').classList.add('hidden');
  $('modal-icon').textContent = icon;
  $('modal-title').textContent = title;
  $('modal-text').innerHTML = html;
  $('modal-btn').textContent = btn;
  $('modal-btn').onclick = () => { $('modal').classList.add('hidden'); if (then) then(); };
  $('modal').classList.remove('hidden');
}

// Règles des pièces féeriques présentes dans le problème
$('btn-rules').addEventListener('click', () => {
  const types = [...new Set(pz.start.b.filter(Boolean).map(E.typeOf))].filter(t => PIECE_BY_ID[t]);
  const html = types.map(t => `<b>${PIECE_BY_ID[t].icon} ${PIECE_BY_ID[t].name}</b><br>${PIECE_BY_ID[t].rules}`).join('<br><br>');
  modal(types.map(t => PIECE_BY_ID[t].icon).join(''), 'Rappel', html, 'Compris');
});
$('btn-hint').addEventListener('click', onHint);
$('btn-retry').addEventListener('click', () => { if (!pz.busy) resetPuzzle(); });
$('btn-reset').addEventListener('click', () => {
  modal('🗑️', 'Tout effacer ?', 'Votre progression sera perdue.', 'Effacer', () => {
    progress = { solved: {}, intro: {} }; save(); renderHome();
  }, true);
});

renderHome();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
