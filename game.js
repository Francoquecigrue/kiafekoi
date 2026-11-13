(() => {
  // ---- Modes de jeu ----
  const MODES = {
    relax: {
      name: "Relax", desc: "Sans chrono : 20 questions, à votre rythme.",
      questions: 20, best: "high",
    },
    classic: {
      name: "Classique", desc: "90 secondes pour marquer un max de points.",
      duration: 90, best: "high",
    },
    survival: {
      name: "Survie", desc: "3 vies, 15 s par question. Erreur ou temps écoulé : une vie en moins.",
      lives: 3, qTime: 15, best: "high",
    },
    chrono: {
      name: "Contre la montre", desc: "10 questions, toutes les têtes à trouver. Erreur : +5 s. Passer : +10 s.",
      questions: 10, penalty: 5, passPenalty: 10, best: "low",
    },
  };
  const STEP = 100;            // 1re trouvaille = 100, 2e = 200, 3e = 300…
  const COLS = 4, ROWS = 3;    // 12 têtes

  const $ = (id) => document.getElementById(id);
  const faces = {};            // id -> élément
  let columns = [];            // columns[c] = ids de bas en haut
  let cellW = 0, cellH = 0;
  let state = null;

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
  const fmtTime = (s) => {
    const m = Math.floor(s / 60), r = s - m * 60;
    return m ? `${m}:${r.toFixed(1).padStart(4, "0")}` : `${r.toFixed(1)} s`;
  };
  const bestKey = (m) => `qec2027-best-${m}`;
  const getBest = (m) => { const v = localStorage.getItem(bestKey(m)); return v === null ? null : Number(v); };
  const fmtResult = (m, v) => (MODES[m].best === "low" ? fmtTime(v) : `${v} pts`);

  // ---- Son ----
  // audio/<id>.mp3 si présent, sinon un « bip vocal » synthétique propre à chaque candidat.
  let soundOn = localStorage.getItem("qec2027-sound") !== "off";
  let actx = null, master = null;
  const clips = {};

  function unlockAudio() {
    // iOS : joue même si le téléphone est en mode silencieux (Safari 17+).
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.9;
      master.connect(actx.destination);
      // Petit son vide pour déverrouiller l'audio sur iOS.
      const b = actx.createBuffer(1, 1, 22050), src = actx.createBufferSource();
      src.buffer = b; src.connect(actx.destination); src.start(0);
    }
    if (actx.state !== "running") actx.resume();
  }
  // Un seul élément audio par candidat ; s'il n'existe pas (404), on bascule sur le bip.
  const missing = {};
  let playing = null;
  function loadClips() {
    for (const c of CANDIDATES) {
      const a = new Audio();
      a.preload = "auto";
      a.addEventListener("error", () => { missing[c.id] = true; }, { once: true });
      a.src = `audio/${c.id}.mp3`;
      clips[c.id] = a;
    }
  }
  function tone(freq, start, dur, type = "square", vol = 0.35) {
    if (!soundOn || !actx) return;
    const t = actx.currentTime + start;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.8, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function voiceOf(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { base: 220 + (h % 220), pattern: [1, 1.2 + (h % 3) * 0.12, 0.85 + (h % 5) * 0.06] };
  }
  function bip(id) {
    const v = voiceOf(id);
    v.pattern.forEach((m, i) => tone(v.base * m, i * 0.09, 0.12));
  }
  function playCandidate(id) {
    if (!soundOn) return;
    if (playing) { playing.pause(); playing = null; } // pas de chevauchement
    const a = clips[id];
    if (!a || missing[id]) return bip(id);
    a.currentTime = 0;
    playing = a;
    a.play().catch(() => { playing = null; bip(id); });
  }
  const sfxWrong = () => { tone(140, 0, 0.25, "sawtooth"); tone(100, 0.15, 0.35, "sawtooth"); };
  const sfxWin = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.18, "triangle", 0.4));
  const sfxBank = () => [784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.15, "triangle", 0.4));
  function renderSoundBtn() { $("btn-sound").textContent = soundOn ? "🔊 Son activé" : "🔇 Son coupé"; }

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

  function floatText(el, txt, color) {
    const g = document.createElement("div");
    g.className = "gain";
    g.textContent = txt;
    if (color) g.style.color = color;
    g.style.left = parseFloat(el.style.left) + cellW / 2 + "px";
    g.style.top = parseFloat(el.style.top) + cellH * 0.3 + "px";
    $("board").appendChild(g);
    setTimeout(() => g.remove(), 900);
  }

  // ---- Partie ----
  function startGame(mode) {
    unlockAudio();
    const M = MODES[mode];
    state = {
      mode, M, score: 0, deck: [], current: null, asked: 0,
      found: new Set(), pot: 0, locked: false, timerId: null, over: false,
      timeLeft: M.duration || 0, lives: M.lives || 0, qLeft: 0, elapsed: 0,
      stats: { complete: 0, stops: 0, errors: 0 },
    };
    show("screen-game");
    measure();
    columns = Array.from({ length: COLS }, () => []);
    Object.values(faces).forEach((el) => { el.style.display = "none"; });
    nextQuestion(true);
    let last = performance.now();
    clearInterval(state.timerId);
    state.timerId = setInterval(() => tick(performance.now() - last, (last = performance.now())), 100);
  }

  function tick(dtMs) {
    if (!state || state.over || state.locked) { updateHud(); return; }
    const dt = dtMs / 1000;
    if (state.mode === "classic") {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) { state.timeLeft = 0; state.score += state.pot; state.pot = 0; return endGame(); }
    } else if (state.mode === "survival") {
      state.qLeft -= dt;
      if (state.qLeft <= 0) { state.qLeft = 0; return fail("Temps écoulé !"); }
    } else if (state.mode === "chrono") {
      state.elapsed += dt;
    }
    updateHud();
  }

  function nextQuestion(firstTime) {
    if (state.deck.length === 0) state.deck = shuffle(QUESTIONS);
    state.current = state.deck.pop();
    state.asked++;
    state.found = new Set();
    state.pot = 0;
    state.locked = false;
    state.qLeft = state.M.qTime || 0;
    Object.values(faces).forEach((el) => el.classList.remove("wrong", "missed", "dim", "off"));
    $("question").textContent = state.current.q;
    $("info").classList.add("hidden");
    $("btn-stop").classList.remove("hidden");
    $("screen-game").scrollTop = 0;
    feedback("", "");
    refill(firstTime);
    updateHud();
  }

  const nextValue = () => STEP * (state.found.size + 1);

  function onPick(id, el) {
    if (!state || state.locked || state.found.has(id)) return;
    unlockAudio();
    playCandidate(id);
    const answers = state.current.a;
    if (answers.includes(id)) {
      const gain = nextValue();
      state.found.add(id);
      vibrate(20);
      if (state.mode === "chrono") floatText(el, "✓");
      else { state.pot += gain; floatText(el, "+" + gain); }
      removeFace(id);
      if (state.found.size === answers.length) {
        state.stats.complete++;
        sfxWin();
        endQuestion(state.pot, state.mode === "chrono" ? "Toutes trouvées !" : `Toutes trouvées ! +${state.pot}`, "good");
      } else {
        feedback(state.mode === "chrono" ? "Bien vu !" : `+${gain} — la suivante vaut ${nextValue()}`, "good");
        updateHud();
      }
    } else {
      el.classList.add("wrong");
      vibrate([60, 40, 60]);
      setTimeout(sfxWrong, 150);
      state.stats.errors++;
      if (state.mode === "chrono") {
        // La question continue, avec une pénalité.
        state.elapsed += state.M.penalty;
        el.classList.add("off", "dim");
        floatText(el, `+${state.M.penalty} s`, "#ff4f5e");
        feedback(`Raté ! +${state.M.penalty} s de pénalité`, "bad");
        updateHud();
      } else {
        fail("Raté !");
      }
    }
  }

  // Erreur ou temps écoulé (classique / survie) : moitié de la cagnotte.
  function fail(prefix) {
    const half = Math.floor(state.pot / 2);
    if (state.mode === "survival") state.lives--;
    let msg = state.pot ? `${prefix} Moitié encaissée : +${half}` : `${prefix} +0`;
    if (state.mode === "survival") msg += state.lives > 0 ? ` — ${state.lives} vie(s)` : " — plus de vie";
    endQuestion(half, msg, "bad");
  }

  function onStop() {
    if (!state || state.locked) return;
    unlockAudio();
    state.stats.stops++;
    if (state.mode === "chrono") {
      state.elapsed += state.M.passPenalty;
      return endQuestion(0, `Passée : +${state.M.passPenalty} s`, "info");
    }
    if (state.pot) sfxBank();
    endQuestion(state.pot, state.pot ? `Stop ! +${state.pot}` : "Question passée", "info");
  }

  function isLastQuestion() {
    if (state.mode === "survival") return state.lives <= 0;
    if (state.mode === "chrono") return state.asked >= state.M.questions;
    if (state.mode === "relax") return state.asked >= state.M.questions;
    return false;
  }

  // Encaisse, montre la correction et l'explication (chrono en pause).
  function endQuestion(points, msg, kind) {
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
    $("btn-next").textContent = isLastQuestion() ? "Voir le résultat" : "Question suivante";
    $("btn-quit").classList.toggle("hidden", state.mode !== "relax" || isLastQuestion());
    $("info").classList.remove("hidden");
    $("btn-stop").classList.add("hidden");
    updateHud();
    requestAnimationFrame(() => $("btn-next").scrollIntoView({ behavior: "smooth", block: "end" }));
  }

  function onNext() {
    if (!state || state.over) return;
    if (isLastQuestion()) return endGame();
    if (state.mode === "classic" && state.timeLeft <= 0) return endGame();
    nextQuestion(false);
  }

  function endGame() {
    clearInterval(state.timerId);
    state.over = true;
    state.locked = true;
    const m = state.mode, M = state.M;
    const result = M.best === "low" ? Math.round(state.elapsed * 10) / 10 : state.score;
    const best = getBest(m);
    const isRecord = best === null || (M.best === "low" ? result < best : result > best);
    if (isRecord && (M.best === "low" || result > 0)) localStorage.setItem(bestKey(m), result);
    const titles = { relax: "Partie terminée", classic: "Temps écoulé", survival: "Plus de vies", chrono: "Arrivée !" };
    $("end-title").textContent = titles[m];
    $("final-label").textContent = M.best === "low" ? "Temps" : "Score";
    $("final-score").textContent = fmtResult(m, result);
    const newBest = getBest(m);
    $("best-end").textContent = newBest === null ? "—" : fmtResult(m, newBest);
    const showRecord = isRecord && (M.best === "low" || result > 0);
    $("new-record").classList.toggle("hidden", !showRecord);
    const s = state.stats;
    const parts = [`${s.complete} complète(s)`, `${s.stops} ${m === "chrono" ? "passée(s)" : "stop"}`, `${s.errors} erreur(s)`];
    if (m === "survival" || m === "relax") parts.unshift(`${state.asked} question(s) jouée(s)`);
    $("stats").textContent = parts.join(" · ");
    if (showRecord) sfxWin();
    show("screen-end");
  }

  // ---- Affichage ----
  function feedback(msg, kind) {
    $("feedback").textContent = msg;
    $("feedback").className = "feedback " + kind;
  }

  function setHud(l1, v1, l2, v2, l3, v3) {
    $("hud1-label").textContent = l1; $("hud1").textContent = v1;
    $("hud2-label").textContent = l2; $("time").textContent = v2;
    $("hud3-label").textContent = l3; $("hud3").textContent = v3;
  }

  function updateHud() {
    if (!state) return;
    const m = state.mode, M = state.M;
    let ratio = 1, low = false;
    if (m === "relax") {
      setHud("Score", state.score, "Question", `${state.asked}/${M.questions}`, "Cagnotte", state.pot);
      ratio = (state.asked - (state.locked ? 0 : 1)) / M.questions;
    } else if (m === "classic") {
      const t = Math.ceil(state.timeLeft);
      setHud("Score", state.score, "Temps", t, "Cagnotte", state.pot);
      ratio = state.timeLeft / M.duration; low = t <= 10;
    } else if (m === "survival") {
      const t = Math.ceil(state.qLeft);
      setHud("Score", state.score, "Temps", t, "Vies", "❤️".repeat(Math.max(state.lives, 0)) || "—");
      ratio = state.qLeft / M.qTime; low = t <= 5;
    } else {
      setHud("Question", `${state.asked}/${M.questions}`, "Chrono", fmtTime(state.elapsed), "Erreurs", state.stats.errors);
      ratio = (state.asked - (state.locked ? 0 : 1)) / M.questions;
    }
    $("time").parentElement.classList.toggle("low", low && !state.locked);
    $("timebar-fill").style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";

    const stop = $("btn-stop");
    if (m === "chrono") stop.textContent = `Passer (+${M.passPenalty} s)`;
    else stop.textContent = state.pot ? `Stop — encaisser ${state.pot}` : "Passer";
    const n = state.current ? state.current.a.length : 0;
    $("progress").textContent = state.current ? `${state.found.size} / ${n} trouvée(s)` : "";
  }

  const vibrate = (p) => { if (navigator.vibrate) navigator.vibrate(p); };

  // ---- Menu ----
  function renderMenu() {
    const box = $("modes");
    box.innerHTML = "";
    for (const [key, M] of Object.entries(MODES)) {
      const b = document.createElement("button");
      b.className = "mode";
      const best = getBest(key);
      b.innerHTML = `<b></b><span></span><small></small>`;
      b.querySelector("b").textContent = M.name;
      b.querySelector("span").textContent = M.desc;
      b.querySelector("small").textContent = best === null ? "Pas encore de record" : `Record : ${fmtResult(key, best)}`;
      b.addEventListener("click", () => startGame(key));
      box.appendChild(b);
    }
    renderSoundBtn();
  }

  // ---- Init ----
  buildFaces();
  loadClips();
  renderMenu();
  window.addEventListener("resize", () => { if (state && !state.over) { measure(); layout(); } });
  $("btn-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem("qec2027-sound", soundOn ? "on" : "off");
    renderSoundBtn();
    if (soundOn) { unlockAudio(); sfxBank(); }
  });
  $("btn-restart").addEventListener("click", () => startGame(state.mode));
  $("btn-menu").addEventListener("click", () => { renderMenu(); show("screen-start"); });
  $("btn-stop").addEventListener("click", onStop);
  $("btn-next").addEventListener("click", onNext);
  $("btn-quit").addEventListener("click", () => { if (state && !state.over) endGame(); });
})();
