"use strict";

const $ = (s) => document.querySelector(s);
const etat = { cartes: [], revelees: new Set() };

// « France (Corse) » est filtré sous « France ».
const paysBase = (p) => (p || "").replace(/\s*\(.*\)$/, "");
const langues = (l) => (l || "").split(",").map((x) => x.trim()).filter(Boolean);

function remplir(select, valeurs) {
  [...new Set(valeurs)].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"))
    .forEach((v) => select.add(new Option(v, v)));
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

function carte(c) {
  const visible = !$("#f-cacher").checked || etat.revelees.has(c.id);
  const recto = el("div", { class: "face recto" },
    el("img", { src: `qr/${c.id}.svg`, alt: `QR code de la carte ${c.num}`, loading: "lazy", width: "160", height: "160" }),
    el("span", { class: "num" }, `n° ${c.num}`));
  const lieu = [c.pays, c.langue].filter(Boolean).join(" · ");
  const verso = el("div", { class: "face verso" },
    el("div", { class: "lieu" }, lieu),
    el("div", { class: "annee" }, c.annee || "?"),
    c.annee_source === "composition" ? null : el("div", { class: "alerte" }, "date d'album, à vérifier"),
    el("div", { class: "titre" }, c.titre, c.explicite ? el("span", { class: "explicite", title: "Paroles explicites" }, "E") : null),
    el("div", { class: "artistes" }, c.artistes),
    c.contexte ? el("p", { class: "contexte" }, c.contexte) : null,
    el("div", { class: "causes" }, c.causes.join(" · ")));
  return el("article", { class: "carte" + (visible ? " revelee" : ""), "data-id": c.id },
    visible ? verso : recto,
    el("div", { class: "actions" },
      el("a", { href: `jouer.html#${c.id}`, class: "lien" }, "Écouter"),
      el("button", { type: "button", onclick: () => basculer(c.id) }, visible ? "Masquer" : "Révéler")));
}

function basculer(id) {
  if (!$("#f-cacher").checked) { $("#f-cacher").checked = true; etat.revelees.clear(); }
  etat.revelees.has(id) ? etat.revelees.delete(id) : etat.revelees.add(id);
  afficher();
}

function afficher() {
  const p = $("#f-pays").value, ca = $("#f-cause").value, la = $("#f-langue").value;
  const liste = etat.cartes.filter((c) =>
    (!p || paysBase(c.pays) === p) && (!ca || c.causes.includes(ca)) && (!la || langues(c.langue).includes(la)));
  $("#grille").replaceChildren(...liste.map(carte));
  $("#compte").textContent = `${liste.length} carte${liste.length > 1 ? "s" : ""} sur ${etat.cartes.length}`;
}

async function demarrer() {
  try {
    const r = await fetch("cartes.json");
    if (!r.ok) throw new Error(r.status);
    etat.cartes = await r.json();
  } catch (e) {
    $("#grille").textContent = "Impossible de charger cartes.json. Ouvrez le site via un serveur web (voir README), pas en file://.";
    return;
  }
  remplir($("#f-pays"), etat.cartes.map((c) => paysBase(c.pays)));
  remplir($("#f-cause"), etat.cartes.flatMap((c) => c.causes));
  remplir($("#f-langue"), etat.cartes.flatMap((c) => langues(c.langue)));
  ["#f-pays", "#f-cause", "#f-langue"].forEach((s) => $(s).addEventListener("change", afficher));
  $("#f-cacher").addEventListener("change", () => { etat.revelees.clear(); afficher(); });
  $("#tout-reveler").addEventListener("click", () => {
    $("#f-cacher").checked = true;
    etat.cartes.forEach((c) => etat.revelees.add(c.id));
    afficher();
  });
  afficher();
}

demarrer();
