"use strict";
// Mode solo : placer 10 chansons sur sa ligne du temps avec le moins d'erreurs possible.
// Utilise l'état et le lecteur de jouer.js (etat, lire, pause, appareilCible, ficheCarte, log).

const OBJECTIF = 10;
const CLE_RECORD = "cdl.solo.record";
const solo = { pioche: [], ligne: [], courante: null, places: 0, erreurs: 0, phase: "attente" };

const anneeNum = (c) => parseInt(c.annee, 10);

function melanger(liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nouvellePartie() {
  const jouables = etat.cartes.filter((c) => Number.isFinite(anneeNum(c)));
  if (jouables.length < OBJECTIF + 1) { log("Pas assez de cartes avec une année pour jouer en solo.", "erreur"); return; }
  solo.pioche = melanger(jouables);
  solo.ligne = [solo.pioche.pop()]; // carte de départ, révélée
  solo.places = 0;
  solo.erreurs = 0;
  solo.dernier = null;
  solo.nouveauRecord = false;
  $("#solo-jeu").hidden = false;
  log("Solo : nouvelle partie.");
  suivante();
}

function suivante() {
  if (!solo.pioche.length) { fin("Plus de cartes dans la pioche."); return; }
  solo.courante = solo.pioche.pop();
  solo.phase = "ecoute";
  etat.idCourant = solo.courante.id;
  afficherSolo();
  if (appareilCible()) lire(); // le clic sur le bouton vaut geste utilisateur
}

// Position correcte : toute place où l'année est comprise entre ses voisines (égalités acceptées).
function placeCorrecte(i, annee) {
  const avant = i > 0 ? anneeNum(solo.ligne[i - 1]) : -Infinity;
  const apres = i < solo.ligne.length ? anneeNum(solo.ligne[i]) : Infinity;
  return avant <= annee && annee <= apres;
}

function placer(i) {
  if (solo.phase !== "ecoute") return;
  const c = solo.courante;
  const y = anneeNum(c);
  const juste = placeCorrecte(i, y);
  if (juste) {
    solo.ligne.splice(i, 0, c);
    solo.places++;
  } else {
    solo.erreurs++;
  }
  log(`Solo : carte n° ${c.num} ${juste ? "bien placée" : "mal placée"} (${solo.places}/${OBJECTIF}, ${solo.erreurs} erreur(s)).`);
  solo.phase = "resultat";
  solo.dernier = { juste, carte: c };
  if (solo.places >= OBJECTIF) fin();
  else afficherSolo();
}

function fin(raison) {
  solo.phase = "fini";
  const record = parseInt(localStorage.getItem(CLE_RECORD) || "", 10);
  solo.nouveauRecord = solo.places >= OBJECTIF && (!Number.isFinite(record) || solo.erreurs < record);
  if (solo.nouveauRecord) localStorage.setItem(CLE_RECORD, String(solo.erreurs));
  solo.raison = raison;
  afficherSolo();
}

function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  enfants.flat().forEach((e) => e != null && n.append(e));
  return n;
}

function afficherSolo() {
  const record = localStorage.getItem(CLE_RECORD);
  $("#solo-score").textContent = solo.phase === "attente"
    ? (record !== null ? `Record : 10 chansons avec ${record} erreur(s).` : "")
    : `${solo.places}/${OBJECTIF} placées · ${solo.erreurs} erreur${solo.erreurs > 1 ? "s" : ""}`;

  const ecoute = solo.phase === "ecoute";
  $("#solo-mystere").hidden = !ecoute;
  $("#solo-aide").textContent = appareilCible()
    ? "Choisissez « Placer ici » à l'endroit où cette chanson se situe dans le temps."
    : "Connectez-vous et choisissez où jouer le son (étapes 1 et 2) pour entendre la chanson.";

  // Résultat de la dernière carte, avec son histoire.
  const res = $("#solo-resultat");
  res.replaceChildren();
  if ((solo.phase === "resultat" || solo.phase === "fini") && solo.dernier) {
    const { juste, carte } = solo.dernier;
    res.append(el("div", { class: juste ? "verdict juste" : "verdict faux" },
      juste ? "Bien placée !" : `Raté : elle date de ${carte.annee}.`));
    if (!juste) res.append(el("p", { class: "etat" }, "La carte est défaussée."));
    res.append(ficheCarte(carte));
  }
  if (solo.phase === "fini") {
    const gagne = solo.places >= OBJECTIF;
    res.prepend(el("div", { class: "verdict fin" },
      gagne ? `Partie terminée : 10 chansons classées avec ${solo.erreurs} erreur${solo.erreurs > 1 ? "s" : ""}.` : solo.raison || "Partie terminée.",
      solo.nouveauRecord ? el("div", {}, "Nouveau record !") : null));
  }
  res.hidden = !res.childNodes.length;
  $("#solo-suivante").hidden = solo.phase !== "resultat";

  // Ligne du temps, du plus ancien au plus récent, avec les emplacements possibles.
  const ol = $("#solo-ligne");
  ol.replaceChildren();
  const fente = (i) => el("li", { class: "fente" },
    el("button", { type: "button", class: "secondaire", onclick: () => placer(i) }, "Placer ici"));
  solo.ligne.forEach((c, i) => {
    if (ecoute) ol.append(fente(i));
    const nouveau = solo.dernier?.juste && solo.dernier.carte === c && solo.phase !== "ecoute";
    ol.append(el("li", { class: "jalon" + (nouveau ? " nouveau" : "") },
      el("span", { class: "annee-jalon" }, c.annee),
      el("span", { class: "titre-jalon" }, `${c.titre} — ${c.artistes}`)));
  });
  if (ecoute) ol.append(fente(solo.ligne.length));
  soloMajBoutons();
}

function soloMajBoutons() {
  const pret = !!appareilCible() && solo.phase === "ecoute";
  $("#solo-lecture").disabled = !pret;
  $("#solo-pause").disabled = !pret;
}

$("#solo-nouvelle").addEventListener("click", nouvellePartie);
$("#solo-suivante").addEventListener("click", suivante);
$("#solo-lecture").addEventListener("click", lire);
$("#solo-pause").addEventListener("click", pause);
afficherSolo();
