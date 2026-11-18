"use strict";
// Lecture à l'aveugle via Spotify : flux PKCE (aucun secret), Web Playback SDK
// ou contrôle d'un appareil Spotify Connect. Le titre joué n'est jamais
// affiché ni journalisé tant que l'on n'a pas cliqué sur « Révéler ».

const $ = (s) => document.querySelector(s);
const SCOPES = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";
const REDIRECT_URI = location.origin + location.pathname;
const API = "https://api.spotify.com/v1";
const CLE = { client: "cdl.client_id", jeton: "cdl.jeton", verif: "cdl.pkce", carte: "cdl.carte_en_attente" };

const etat = { cartes: [], idCourant: null, player: null, deviceSdk: null, flux: null, joue: false };

// ---------- Journal ----------
function log(msg, niveau = "info") {
  const t = new Date().toLocaleTimeString("fr-FR");
  const j = $("#journal");
  j.textContent += `[${t}] ${niveau === "erreur" ? "ERREUR " : ""}${msg}\n`;
  j.scrollTop = j.scrollHeight;
  (niveau === "erreur" ? console.error : console.log)(msg);
}

// ---------- PKCE ----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function aleatoire(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, (x) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[x % 62]).join("");
}
const clientId = () => (window.SPOTIFY_CLIENT_ID || localStorage.getItem(CLE.client) || "").trim();

async function connexion() {
  const id = window.SPOTIFY_CLIENT_ID || $("#client-id").value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) { log("Client ID invalide (32 caractères hexadécimaux attendus).", "erreur"); return; }
  localStorage.setItem(CLE.client, id);
  const verif = aleatoire(64);
  const defi = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verif)));
  const st = aleatoire(16);
  sessionStorage.setItem(CLE.verif, JSON.stringify({ verif, st }));
  if (etat.idCourant) sessionStorage.setItem(CLE.carte, etat.idCourant);
  const p = new URLSearchParams({
    response_type: "code", client_id: id, scope: SCOPES, redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256", code_challenge: defi, state: st,
  });
  location.assign("https://accounts.spotify.com/authorize?" + p);
}

async function demanderJeton(corps) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), ...corps }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`jeton refusé (${r.status}) ${d.error || ""} ${d.error_description || ""}`);
  const ancien = JSON.parse(localStorage.getItem(CLE.jeton) || "{}");
  const j = { acces: d.access_token, rafraichir: d.refresh_token || ancien.rafraichir, expire: Date.now() + (d.expires_in - 60) * 1000 };
  localStorage.setItem(CLE.jeton, JSON.stringify(j));
  return j;
}

async function retourAutorisation() {
  const p = new URLSearchParams(location.search);
  if (!p.has("code") && !p.has("error")) return;
  const attendu = JSON.parse(sessionStorage.getItem(CLE.verif) || "{}");
  history.replaceState(null, "", location.pathname + location.hash);
  if (p.has("error")) { log(`Autorisation refusée par Spotify : ${p.get("error")}`, "erreur"); return; }
  if (p.get("state") !== attendu.st) { log("Paramètre state incohérent : connexion ignorée.", "erreur"); return; }
  try {
    await demanderJeton({ grant_type: "authorization_code", code: p.get("code"), redirect_uri: REDIRECT_URI, code_verifier: attendu.verif });
    log("Connexion réussie (jeton PKCE obtenu).");
  } catch (e) { log(e.message, "erreur"); }
  sessionStorage.removeItem(CLE.verif);
}

async function jeton() {
  const j = JSON.parse(localStorage.getItem(CLE.jeton) || "null");
  if (!j) return null;
  if (Date.now() < j.expire) return j.acces;
  if (!j.rafraichir) return null;
  try { return (await demanderJeton({ grant_type: "refresh_token", refresh_token: j.rafraichir })).acces; }
  catch (e) { log(e.message, "erreur"); localStorage.removeItem(CLE.jeton); return null; }
}

async function api(methode, chemin, corps) {
  const t = await jeton();
  if (!t) throw new Error("non connecté");
  const r = await fetch(API + chemin, {
    method: methode,
    headers: { Authorization: "Bearer " + t, ...(corps ? { "Content-Type": "application/json" } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(`${methode} ${chemin.split("?")[0]} → ${r.status} ${d?.error?.message || ""} ${d?.error?.reason || ""}`.trim());
    e.statut = r.status; throw e;
  }
  return d;
}

// ---------- Lecteur ----------
const mode = () => document.querySelector("input[name=mode]:checked").value;
const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function chargerSdk() {
  if (etat.player || document.getElementById("sdk-spotify")) return;
  if (mobile) log("Navigateur mobile : Spotify ne prend pas en charge le Web Playback SDK sur mobile. Utiliser le mode « appareil Spotify ».");
  window.onSpotifyWebPlaybackSDKReady = () => {
    log("SDK chargé, création du lecteur…");
    const player = new Spotify.Player({ name: "Chansons de lutte (test)", getOAuthToken: (cb) => jeton().then(cb), volume: 0.8 });
    etat.player = player;
    player.addListener("ready", ({ device_id }) => {
      etat.deviceSdk = device_id;
      $("#etat-lecteur").textContent = "Lecteur du navigateur prêt.";
      log(`Lecteur prêt (appareil ${device_id.slice(0, 6)}…).`);
      majBoutons();
    });
    player.addListener("not_ready", () => { etat.deviceSdk = null; log("Lecteur hors ligne.", "erreur"); majBoutons(); });
    player.addListener("initialization_error", ({ message }) => log(`initialization_error : ${message} (navigateur non pris en charge ?)`, "erreur"));
    player.addListener("authentication_error", ({ message }) => log(`authentication_error : ${message} (jeton ou portée « streaming » refusés ; en mode développement, le compte doit être ajouté à la liste des utilisateurs de l'application)`, "erreur"));
    player.addListener("account_error", ({ message }) => log(`account_error : ${message} (compte non Premium ?)`, "erreur"));
    player.addListener("playback_error", ({ message }) => log(`playback_error : ${message}`, "erreur"));
    player.addListener("autoplay_failed", () => log("Lecture automatique bloquée par le navigateur : recliquer sur « Lire ».", "erreur"));
    player.addListener("player_state_changed", (s) => {
      if (!s) return;
      // Volontairement aucune métadonnée du titre ici.
      etat.joue = !s.paused;
      $("#disque").classList.toggle("tourne", etat.joue);
      masquerMediaSession();
    });
    player.connect().then((ok) => log(ok ? "Connexion du lecteur demandée." : "player.connect() a échoué.", ok ? "info" : "erreur"));
  };
  const s = document.createElement("script");
  s.id = "sdk-spotify"; s.src = "https://sdk.scdn.co/spotify-player.js";
  s.onerror = () => log("Impossible de charger sdk.scdn.co (réseau ou bloqueur).", "erreur");
  document.head.append(s);
}

// Les contrôles multimédias du système (écran verrouillé, notification)
// peuvent afficher le titre : on remplace les métadonnées et on le signale.
function masquerMediaSession() {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  const m = navigator.mediaSession.metadata;
  if (m && m.title && m.title !== "Chanson mystère") log("Le navigateur exposait des métadonnées du titre aux contrôles système : remplacées.");
  if (!m || m.title !== "Chanson mystère") navigator.mediaSession.metadata = new MediaMetadata({ title: "Chanson mystère", artist: "Chansons de lutte" });
}

async function listerAppareils() {
  try {
    const d = await api("GET", "/me/player/devices");
    const sel = $("#appareils");
    sel.replaceChildren(...d.devices.map((x) => new Option(`${x.name} (${x.type})${x.is_active ? " — actif" : ""}`, x.id)));
    log(`${d.devices.length} appareil(s) Spotify trouvé(s).${d.devices.length ? "" : " Ouvrir l'application Spotify sur le téléphone puis Actualiser."}`);
  } catch (e) { log(e.message, "erreur"); }
  majBoutons();
}

function appareilCible() {
  return mode() === "sdk" ? etat.deviceSdk : $("#appareils").value || null;
}

async function lire() {
  const device = appareilCible();
  if (!device || !etat.idCourant) return;
  if (etat.player && mode() === "sdk") await etat.player.activateElement(); // geste utilisateur requis
  const uri = "spotify:track:" + etat.idCourant;
  try {
    await api("PUT", `/me/player/play?device_id=${encodeURIComponent(device)}`, { uris: [uri] });
  } catch (e) {
    if (e.statut === 404) {
      log("Appareil introuvable : transfert de la lecture puis nouvel essai.");
      try {
        await api("PUT", "/me/player", { device_ids: [device], play: false });
        await new Promise((r) => setTimeout(r, 800));
        await api("PUT", `/me/player/play?device_id=${encodeURIComponent(device)}`, { uris: [uri] });
      } catch (e2) { log(e2.message, "erreur"); return; }
    } else {
      log(e.message + (e.statut === 403 ? " (403 : compte non Premium, ou utilisateur absent de la liste du mode développement)" : ""), "erreur");
      return;
    }
  }
  etat.joue = true;
  $("#disque").classList.add("tourne");
  log("Lecture lancée.");
  setTimeout(masquerMediaSession, 1500);
}

async function pause() {
  try {
    if (etat.player && mode() === "sdk") await etat.player.pause();
    else await api("PUT", `/me/player/pause?device_id=${encodeURIComponent(appareilCible() || "")}`);
    etat.joue = false; $("#disque").classList.remove("tourne");
  } catch (e) { log(e.message, "erreur"); }
}

// ---------- Choix de la carte ----------
function extraireId(texte) {
  const t = (texte || "").trim();
  const m = t.match(/track[/:]([A-Za-z0-9]{22})/) || t.match(/#([A-Za-z0-9]{22})$/) || t.match(/^([A-Za-z0-9]{22})$/);
  return m ? m[1] : null;
}

function choisir(id, origine) {
  if (!id) { log(`Contenu non reconnu (${origine}) : un lien ou une URI de titre Spotify est attendu.`, "erreur"); return; }
  etat.idCourant = id;
  const c = etat.cartes.find((x) => x.id === id);
  $("#etat-carte").textContent = c ? `Carte n° ${c.num} prête.` : "Titre hors jeu prêt (absent de cartes.json).";
  $("#revelation").classList.add("cache");
  history.replaceState(null, "", location.pathname + "#" + id);
  log(`Carte choisie (${origine})${c ? ` : n° ${c.num}` : ""}.`);
  majBoutons();
}

async function reveler() {
  const c = etat.cartes.find((x) => x.id === etat.idCourant);
  const r = $("#revelation");
  r.replaceChildren();
  const ajout = (tag, txt, cls) => { const n = document.createElement(tag); n.textContent = txt; if (cls) n.className = cls; r.append(n); };
  if (c) {
    ajout("div", c.annee || "?", "annee");
    if (c.annee_source !== "composition") ajout("div", "date d'album, à vérifier", "alerte");
    ajout("strong", c.titre);
    ajout("div", c.artistes);
    ajout("div", [c.pays, c.langue].filter(Boolean).join(" · "), "etat");
    if (c.contexte) ajout("p", c.contexte);
  } else {
    try {
      const t = await api("GET", "/tracks/" + etat.idCourant);
      ajout("div", (t.album?.release_date || "?").slice(0, 4), "annee");
      ajout("strong", t.name);
      ajout("div", t.artists.map((a) => a.name).join(", "));
    } catch (e) { ajout("div", "Titre absent du jeu et informations Spotify indisponibles."); log(e.message, "erreur"); }
  }
  r.classList.remove("cache");
}

async function scanner() {
  if (etat.flux) return arreterScan();
  const video = $("#video");
  try {
    etat.flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch (e) { log(`Caméra indisponible : ${e.message} (HTTPS requis, autoriser la caméra).`, "erreur"); return; }
  video.srcObject = etat.flux; video.classList.remove("cache"); await video.play();
  $("#scanner").textContent = "Arrêter le scan";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const detecteur = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
  const boucle = async () => {
    if (!etat.flux) return;
    if (video.readyState >= 2) {
      let texte = null;
      if (detecteur) {
        try { texte = (await detecteur.detect(video))[0]?.rawValue || null; } catch { /* repli sur jsQR */ }
      }
      if (!texte) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        texte = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
      }
      if (texte) { arreterScan(); choisir(extraireId(texte), "QR code"); return; }
    }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
}

function arreterScan() {
  etat.flux?.getTracks().forEach((t) => t.stop());
  etat.flux = null;
  $("#video").classList.add("cache");
  $("#scanner").textContent = "Scanner un QR code";
}

// ---------- Interface ----------
function majBoutons() {
  const pret = !!appareilCible() && !!etat.idCourant;
  $("#lecture").disabled = !pret;
  $("#pause").disabled = !pret;
  $("#reveler").disabled = !etat.idCourant;
}

async function majConnexion() {
  const t = await jeton();
  $("#connexion").classList.toggle("cache", !!t);
  $("#deconnexion").classList.toggle("cache", !t);
  $("#ligne-client").classList.toggle("cache", !!window.SPOTIFY_CLIENT_ID || !!t);
  if (!t) { $("#etat-connexion").textContent = "Non connecté."; return; }
  try {
    const moi = await api("GET", "/me");
    const produit = moi.product ? `compte ${moi.product}` : "type de compte non communiqué";
    $("#etat-connexion").textContent = `Connecté (${produit}).`;
    log(`Profil lu : ${produit}, pays ${moi.country || "non communiqué"}.`);
    if (moi.product && moi.product !== "premium") log("Le compte n'est pas Premium : la lecture sera refusée.", "erreur");
  } catch (e) {
    $("#etat-connexion").textContent = "Connecté, mais profil illisible.";
    log(e.message + (e.statut === 403 ? " (403 : en mode développement, ajouter ce compte dans « User Management » du tableau de bord)" : ""), "erreur");
  }
  if (mode() === "sdk") chargerSdk(); else listerAppareils();
}

async function demarrer() {
  $("#uri-redirection").textContent = REDIRECT_URI;
  $("#client-id").value = localStorage.getItem(CLE.client) || "";
  log(`Page chargée. Navigateur ${mobile ? "mobile" : "de bureau"}, contexte ${isSecureContext ? "sécurisé" : "NON sécurisé (HTTPS ou 127.0.0.1 requis)"}.`);
  try { etat.cartes = await (await fetch("cartes.json")).json(); log(`${etat.cartes.length} cartes chargées.`); }
  catch { log("cartes.json introuvable : seuls les liens collés ou scannés fonctionneront.", "erreur"); }

  await retourAutorisation();
  const enAttente = sessionStorage.getItem(CLE.carte);
  sessionStorage.removeItem(CLE.carte);
  const depuisHash = extraireId(location.hash) || enAttente;
  if (depuisHash) choisir(depuisHash, "lien");
  if (mobile) document.querySelector("input[value=connect]").checked = true;
  $("#ligne-appareils").hidden = mode() !== "connect";

  $("#connexion").addEventListener("click", connexion);
  $("#deconnexion").addEventListener("click", () => {
    localStorage.removeItem(CLE.jeton); etat.player?.disconnect(); etat.player = null; etat.deviceSdk = null;
    log("Déconnecté."); majConnexion(); majBoutons();
  });
  document.querySelectorAll("input[name=mode]").forEach((r) => r.addEventListener("change", async () => {
    $("#ligne-appareils").hidden = mode() !== "connect";
    if (await jeton()) { if (mode() === "sdk") chargerSdk(); else listerAppareils(); }
    majBoutons();
  }));
  $("#appareils").addEventListener("change", majBoutons);
  $("#rafraichir-appareils").addEventListener("click", listerAppareils);
  $("#scanner").addEventListener("click", scanner);
  $("#hasard").addEventListener("click", () => {
    if (!etat.cartes.length) return;
    choisir(etat.cartes[Math.floor(Math.random() * etat.cartes.length)].id, "hasard");
  });
  $("#valider").addEventListener("click", () => choisir(extraireId($("#saisie").value), "saisie"));
  $("#saisie").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#valider").click(); });
  $("#lecture").addEventListener("click", lire);
  $("#pause").addEventListener("click", pause);
  $("#reveler").addEventListener("click", reveler);
  $("#copier-journal").addEventListener("click", () => navigator.clipboard.writeText($("#journal").textContent).then(() => log("Journal copié.")));
  window.addEventListener("hashchange", () => { const id = extraireId(location.hash); if (id && id !== etat.idCourant) choisir(id, "lien"); });

  await majConnexion();
  majBoutons();
}

demarrer();
