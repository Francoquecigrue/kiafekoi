(() => {
  // ---- Réglages ----
  const GAME_DURATION = 90;    // secondes
  const STEP = 100;            // 1re trouvaille = 100, 2e = 200, 3e = 300…
  const COLS = 4, ROWS = 3;    // 12 têtes
  const BEST_KEY = "quiz-presidentielle-2027-best";

  const $ = (id) => document.getElementById(id);
  const faces = {};            // id -> élément
  let columns = [];            // columns[c] = ids de bas en haut
  let cellW = 0, cellH = 0;
  let state;

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const initials = (n) => n.split(/[\s-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const show = (screen) => {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(screen).classList.add("active");
  };
  const getBest = () => Number(localStorage.getItem(BEST_KEY) || 0);

  // ---- Son ----
  // audio/<id>.mp3 si présent, sinon un « bip vocal » synthétique propre à chaque candidat.
  let actx = null;
  const clips = {};
  function initAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function loadClips() {
    for (const c of CANDIDATES) {
      const a = new Audio();
      a.preload = "auto";
      a.addEventListener("canplaythrough", () => { clips[c.id] = a; }, { once: true });
      a.src = `audio/${c.id}.mp3`;
    }
  }
  function tone(freq, start, dur, type = "sawtooth", vol = 0.18) {
    if (!actx) return;
    const t = actx.currentTime + start;
    const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.85, t + dur);
    f.type = "bandpass"; f.frequency.value = freq * 3; f.Q.value = 1.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function voiceOf(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { base: 140 + (h % 160), pattern: [1, 1.25 + (h % 3) * 0.1, 0.9 + (h % 5) * 0.05] };
  }
  function playCandidate(id) {
    const clip = clips[id];
    if (clip) {
      const a = clip.cloneNode();
      a.play().catch(() => {});
      return;
    }
    const v = voiceOf(id);
    v.pattern.forEach((m, i) => tone(v.base * m, i * 0.07, 0.09));
  }
  const sfxWrong = () => { tone(110, 0, 0.25, "square", 0.15); tone(90, 0.12, 0.3, "square", 0.15); };
  const sfxWin = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.15, "triangle", 0.15));
  const sfxBank = () => [784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.12, "triangle", 0.12));

  // ---- Plateau avec gravité ----
  function buildFaces() {
    const board = $("board");
    board.innerHTML = "";
    for (const c of CANDIDATES) {
      const btn = document.createElement("button");
      btn.className = "face nofx";
      btn.dataset.id = c.id;
      btn.style.display = "none";
      const av = document.createElement("div");
      av.className = "avatar";
      av.style.background = c.color;
      av.textContent = initials(c.name);
      const img = new Image();
      img.alt = c.name;
      img.onload = () => { av.textContent = ""; av.appendChild(img); };
      img.src = `photos/${c.id}.jpg`;
      const nm = document.createElement("span");
      nm.className = "name";
      nm.textContent = c.name;
      btn.append(av, nm);
      btn.addEventListener("click", () => onPick(c.id, btn));
      board.appendChild(btn);
      faces[c.id] = btn;
    }
  }

  function measure() {
    const board = $("board");
    cellW = board.clientWidth / COLS;
    cellH = cellW * 1.22;
    board.style.height = cellH * ROWS + "px";
    for (const el of Object.values(faces)) {
      el.style.width = cellW + "px";
      el.style.height = cellH + "px";
    }
  }

  // Place chaque tête selon sa colonne et sa hauteur dans la pile.
  function layout() {
    columns.forEach((col, c) => {
      col.forEach((id, r) => {
        const el = faces[id];
        el.style.left = c * cellW + "px";
        el.style.top = (ROWS - 1 - r) * cellH + "px";
      });
    });
  }

  // Les têtes absentes tombent du haut pour compléter les piles.
  function refill(firstTime) {
    const present = new Set(columns.flat());
    const missing = shuffle(CANDIDATES.map((c) => c.id).filter((id) => !present.has(id)));
    const dropped = [];
    columns.forEach((col, c) => {
      let k = 0;
      while (col.length < ROWS && missing.length) {
        const id = missing.pop();
        const el = faces[id];
        el.className = "face nofx";
        el.style.display = "";
        el.style.left = c * cellW + "px";
        el.style.top = -(k + 1) * cellH - (firstTime ? Math.random() * cellH : 0) + "px";
        col.push(id);
        dropped.push(el);
        k++;
      }
    });
    void $("board").offsetHeight; // force le reflow avant l'animation
    dropped.forEach((el) => el.classList.remove("nofx"));
    layout();
  }

  function removeFace(id) {
    const el = faces[id];
    el.classList.add("pop");
    setTimeout(() => {
      el.style.display = "none";
      el.classList.add("nofx");
      columns = columns.map((col) => col.filter((x) => x !== id));
      layout(); // les têtes au-dessus tombent
    }, 230);
  }

  function floatGain(el, txt) {
    const g = document.createElement("div");
    g.className = "gain";
    g.textContent = txt;
    g.style.left = parseFloat(el.style.left) + cellW / 2 + "px";
    g.style.top = parseFloat(el.style.top) + cellH * 0.3 + "px";
    $("board").appendChild(g);
    setTimeout(() => g.remove(), 900);
  }

  // ---- Partie ----
  function startGame() {
    initAudio();
    state = {
      score: 0, timeLeft: GAME_DURATION, deck: [], current: null,
      found: new Set(), pot: 0, locked: false, timerId: null,
      stats: { complete: 0, stops: 0, errors: 0 },
    };
    show("screen-game");
    measure();
    columns = Array.from({ length: COLS }, () => []);
    Object.values(faces).forEach((el) => { el.style.display = "none"; });
    nextQuestion(true);
    let last = performance.now();
    state.timerId = setInterval(() => {
      const now = performance.now();
      if (!state.locked) state.timeLeft -= (now - last) / 1000;
      last = now;
      if (state.timeLeft <= 0) { state.timeLeft = 0; endGame(); }
      updateTimer();
    }, 100);
  }

  function nextQuestion(firstTime) {
    if (state.deck.length === 0) state.deck = shuffle(QUESTIONS);
    state.current = state.deck.pop();
    state.found = new Set();
    state.pot = 0;
    state.locked = false;
    Object.values(faces).forEach((el) => el.classList.remove("wrong", "missed", "dim"));
    $("question").textContent = state.current.q;
    $("info").classList.add("hidden");
    $("btn-stop").classList.remove("hidden");
    feedback("", "");
    refill(firstTime);
    updateHud();
  }

  const nextValue = () => STEP * (state.found.size + 1);

  function onPick(id, el) {
    if (!state || state.locked || state.found.has(id)) return;
    initAudio();
    playCandidate(id);
    const answers = state.current.a;
    if (answers.includes(id)) {
      const gain = nextValue();
      state.pot += gain;
      state.found.add(id);
      floatGain(el, "+" + gain);
      removeFace(id);
      vibrate(20);
      if (state.found.size === answers.length) {
        state.stats.complete++;
        sfxWin();
        bank(state.pot, `Toutes trouvées ! +${state.pot}`, "good");
      } else {
        feedback(`+${gain} — la suivante vaut ${nextValue()}`, "good");
        updateHud();
      }
    } else {
      el.classList.add("wrong");
      vibrate([60, 40, 60]);
      setTimeout(sfxWrong, 150);
      state.stats.errors++;
      const half = Math.floor(state.pot / 2);
      bank(half, state.pot ? `Raté ! Moitié encaissée : +${half}` : "Raté ! +0", "bad");
    }
  }

  function onStop() {
    if (!state || state.locked) return;
    initAudio();
    state.stats.stops++;
    if (state.pot) sfxBank();
    bank(state.pot, state.pot ? `Stop ! +${state.pot}` : "Question passée", "info");
  }

  // Encaisse, montre la correction et l'explication (chrono en pause).
  function bank(points, msg, kind) {
    state.locked = true;
    state.score += points;
    state.pot = 0;
    feedback(msg, kind);
    for (const [id, el] of Object.entries(faces)) {
      if (state.found.has(id)) continue;
      if (state.current.a.includes(id)) el.classList.add("missed");
      else if (!el.classList.contains("wrong")) el.classList.add("dim");
    }
    $("info-text").textContent = state.current.info || "";
    $("info").classList.remove("hidden");
    $("btn-stop").classList.add("hidden");
    updateHud();
  }

  function endGame() {
    clearInterval(state.timerId);
    state.score += state.pot; // temps écoulé : la cagnotte en cours est encaissée
    state.pot = 0;
    state.locked = true;
    const best = getBest();
    const isRecord = state.score > best;
    if (isRecord) localStorage.setItem(BEST_KEY, state.score);
    $("final-score").textContent = state.score;
    $("best-end").textContent = Math.max(best, state.score);
    $("new-record").classList.toggle("hidden", !isRecord);
    const s = state.stats;
    $("stats").textContent = `${s.complete} question(s) complète(s) · ${s.stops} stop · ${s.errors} erreur(s)`;
    if (isRecord) sfxWin();
    show("screen-end");
  }

  // ---- Affichage ----
  function feedback(msg, kind) {
    $("feedback").textContent = msg;
    $("feedback").className = "feedback " + kind;
  }

  function updateHud() {
    $("score").textContent = state.score;
    $("pot").textContent = state.pot;
    $("stop-val").textContent = state.pot;
    $("btn-stop").firstChild.textContent = state.pot ? "Stop — encaisser " : "Passer ";
    $("stop-val").style.display = state.pot ? "" : "none";
    const n = state.current ? state.current.a.length : 0;
    $("progress").textContent = state.current ? `${state.found.size} / ${n} trouvée(s)` : "";
    updateTimer();
  }

  function updateTimer() {
    const t = Math.ceil(state.timeLeft);
    $("time").textContent = t;
    $("time").parentElement.classList.toggle("low", t <= 10);
    $("timebar-fill").style.width = (100 * state.timeLeft / GAME_DURATION) + "%";
  }

  const vibrate = (p) => { if (navigator.vibrate) navigator.vibrate(p); };

  // ---- Init ----
  $("rule-time").textContent = GAME_DURATION;
  $("best-start").textContent = getBest();
  buildFaces();
  loadClips();
  window.addEventListener("resize", () => { if (state) { measure(); layout(); } });
  $("btn-start").addEventListener("click", startGame);
  $("btn-restart").addEventListener("click", startGame);
  $("btn-stop").addEventListener("click", onStop);
  $("btn-next").addEventListener("click", () => { if (state && state.timeLeft > 0) nextQuestion(false); });
})();
