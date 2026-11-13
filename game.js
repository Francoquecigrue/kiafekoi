(() => {
  // ---- Réglages ----
  const GAME_DURATION = 90;    // secondes
  const STEP = 100;            // 1re trouvaille = 100, 2e = 200, 3e = 300…
  const REVEAL_MS = 1400;      // durée d'affichage de la correction (chrono en pause)
  const BEST_KEY = "quiz-presidentielle-best";

  const $ = (id) => document.getElementById(id);
  const byId = Object.fromEntries(CANDIDATES.map((c) => [c.id, c]));

  let state;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function initials(name) {
    return name.split(/[\s-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  function show(screen) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(screen).classList.add("active");
  }

  function getBest() { return Number(localStorage.getItem(BEST_KEY) || 0); }

  // ---- Grille des têtes ----
  function buildGrid() {
    const grid = $("grid");
    grid.innerHTML = "";
    for (const c of CANDIDATES) {
      const btn = document.createElement("button");
      btn.className = "face";
      btn.dataset.id = c.id;
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
      grid.appendChild(btn);
    }
  }

  function resetFaces() {
    document.querySelectorAll(".face").forEach((f) => {
      f.className = "face";
      f.querySelector(".badge")?.remove();
    });
  }

  // ---- Partie ----
  function startGame() {
    state = {
      score: 0, timeLeft: GAME_DURATION, deck: [], current: null,
      found: new Set(), pot: 0, locked: false, timerId: null,
      stats: { questions: 0, complete: 0, stops: 0, errors: 0 },
    };
    show("screen-game");
    updateHud();
    nextQuestion();
    let last = performance.now();
    state.timerId = setInterval(() => {
      const now = performance.now();
      if (!state.locked) state.timeLeft -= (now - last) / 1000;
      last = now;
      if (state.timeLeft <= 0) { state.timeLeft = 0; endGame(); }
      updateTimer();
    }, 100);
  }

  function nextQuestion() {
    if (state.deck.length === 0) state.deck = shuffle(QUESTIONS);
    state.current = state.deck.pop();
    state.found = new Set();
    state.pot = 0;
    state.locked = false;
    state.stats.questions++;
    resetFaces();
    $("question").textContent = state.current.q;
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    updateHud();
  }

  function nextValue() { return STEP * (state.found.size + 1); }

  function onPick(id, btn) {
    if (!state || state.locked || state.found.has(id)) return;
    const answers = state.current.a;
    if (answers.includes(id)) {
      const gain = nextValue();
      state.pot += gain;
      state.found.add(id);
      btn.classList.add("found");
      const b = document.createElement("span");
      b.className = "badge"; b.textContent = "+" + gain;
      btn.appendChild(b);
      vibrate(20);
      if (state.found.size === answers.length) {
        state.stats.complete++;
        bank(state.pot, `Toutes trouvées ! +${state.pot}`, "good");
      } else {
        feedback(`+${gain} — prochaine : ${nextValue()}`, "good");
        updateHud();
      }
    } else {
      btn.classList.add("wrong");
      vibrate([60, 40, 60]);
      state.stats.errors++;
      const half = Math.floor(state.pot / 2);
      bank(half, state.pot ? `Raté ! Moitié encaissée : +${half}` : "Raté ! +0", "bad");
    }
  }

  function onStop() {
    if (!state || state.locked) return;
    state.stats.stops++;
    bank(state.pot, state.pot ? `Stop ! +${state.pot}` : "Question passée", "info");
  }

  // Encaisse, montre la correction, puis passe à la question suivante.
  function bank(points, msg, kind) {
    state.locked = true;
    state.score += points;
    state.pot = 0;
    feedback(msg, kind);
    revealAnswers();
    updateHud();
    setTimeout(() => { if (state.timeLeft > 0) nextQuestion(); }, REVEAL_MS);
  }

  function revealAnswers() {
    document.querySelectorAll(".face").forEach((f) => {
      const id = f.dataset.id;
      if (state.current.a.includes(id)) { if (!state.found.has(id)) f.classList.add("missed"); }
      else if (!f.classList.contains("wrong")) f.classList.add("dim");
    });
  }

  function endGame() {
    clearInterval(state.timerId);
    // Temps écoulé en cours de question : la cagnotte est encaissée.
    state.score += state.pot;
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
    $("btn-stop").disabled = state.locked;
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

  function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }

  // ---- Init ----
  $("rule-time").textContent = GAME_DURATION;
  $("best-start").textContent = getBest();
  buildGrid();
  $("btn-start").addEventListener("click", startGame);
  $("btn-restart").addEventListener("click", startGame);
  $("btn-stop").addEventListener("click", onStop);
})();
