#!/usr/bin/env python3
"""Génère les QR codes, les données du site et le PDF imprimable des cartes.

Entrée : data/chansons.csv
Sorties :
  qr/<id>.svg            QR codes vectoriels (utilisés par le site et le PDF)
  sortie/png/<id>.png    QR codes PNG 300 dpi
  cartes.json            données du site
  sortie/cartes.html     une carte par page (aperçu), imposée ensuite sur SRA3
  sortie/cartes.pdf      PDF recto verso, rendu par Chrome ou Chromium

Gabarit d'impression et de découpe (repris du modèle de production) :
  planche SRA3 320 x 450 mm, 3 colonnes x 4 rangées, un seul exemplaire par carte ;
  carte 94 x 94 mm avec 2 mm de fond perdu = 90 x 90 mm après découpe ;
  zone utile 86 x 86 mm (2 mm de marge de sécurité intérieure) ;
  coin haut gauche des cartes (fond perdu compris) : x = 13, 113, 213 mm ;
  y = 23, 128, 233, 338 mm. Pages impaires = rectos, pages paires = versos.

Contenu des QR codes :
  par défaut https://open.spotify.com/track/<id> : stable, indépendant de
  l'adresse du site. La page jouer.html sait lire ces QR codes et lancer le
  titre sans l'afficher. Scanné avec l'appareil photo, il ouvre Spotify, qui
  affiche le titre.
  --base-url URL : encode URL/jouer.html#<id> à la place.

Usage : python3 outils/cartes.py [--base-url URL] [--sans-pdf] [--chrome CHEMIN]
"""
import argparse
import csv
import html
import json
import re
import os
import shutil
import subprocess
import sys
from pathlib import Path

import qrcode
import qrcode.image.svg

RACINE = Path(__file__).resolve().parent.parent
CSV = RACINE / "data" / "chansons.csv"
HISTOIRES = RACINE / "data" / "histoires.md"
DOSSIER_QR = RACINE / "qr"
DOSSIER_SORTIE = RACINE / "sortie"

PAGE_L, PAGE_H = 320, 450  # SRA3, mm
POS_X = [13, 113, 213]  # coin haut gauche, fond perdu compris
POS_Y = [23, 128, 233, 338]
COLS, RANGS = len(POS_X), len(POS_Y)
FOND_PERDU = 2
CARTE = 90 + 2 * FOND_PERDU  # 94 mm avant découpe
SECURITE = 2  # marge intérieure : zone utile 86 x 86 mm
QR_MM = 54
ECART_TARDIF = 20  # ans entre écriture et enregistrement au-delà desquels on prévient le joueur
# Sablier : symbole « version tardive », au recto et pendant l'écoute.
SABLIER = ('<svg class="sablier" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
           'stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9'
           'M17 3c0 5-5 6-5 9s5 4 5 9"/></svg>')
# Chrome arrondit la mise en page au pixel CSS (0,26 mm) : on rend les cartes
# à l'échelle RENDU puis l'imposition les ramène exactement à 94 mm.
RENDU = 4
DPI = 300


def lire_histoires():
    """Lit data/histoires.md : une section « ## <id> · Titre — Artiste » par chanson.

    Lignes reconnues : « statut: brouillon|vérifié », « sources: … » et « note: … »
    (remarque interne, non publiée).
    Le reste forme les paragraphes (séparés par une ligne vide).
    """
    if not HISTOIRES.exists():
        return {}
    histoires, courant = {}, None
    for ligne in HISTOIRES.read_text(encoding="utf-8").splitlines():
        if ligne.startswith("## "):
            courant = {"lignes": [], "statut": "brouillon", "sources": []}
            histoires[ligne[3:].split()[0]] = courant
        elif courant is None or ligne.startswith("<!--"):
            continue
        elif ligne.startswith("note:"):
            courant.setdefault("notes", []).append(ligne.split(":", 1)[1].strip())
        elif ligne.startswith("statut:"):
            courant["statut"] = ligne.split(":", 1)[1].strip()
        elif ligne.startswith("sources:"):
            courant["sources"] = [x.strip() for x in ligne.split(":", 1)[1].split(" ; ") if x.strip()]
        else:
            courant["lignes"].append(ligne)
    for h in histoires.values():
        paras = "\n".join(h.pop("lignes")).strip().split("\n\n")
        h.pop("notes", None)
        h["paragraphes"] = [" ".join(p.split()) for p in paras if p.strip()]
    return histoires


def lire_chansons():
    with CSV.open(encoding="utf-8", newline="") as f:
        lignes = list(csv.DictReader(f))
    lignes.sort(key=lambda r: int(r["ligne_source"]))
    histoires = lire_histoires()
    inconnues = set(histoires) - {r["id"] for r in lignes}
    if inconnues:
        sys.exit(f"histoires.md : identifiants absents de chansons.csv : {', '.join(sorted(inconnues))}")
    cartes = []
    for num, r in enumerate(lignes, 1):
        compo = r["annee_composition"].strip()
        enreg = r.get("annee_enregistrement", "").strip()
        force = r.get("version_tardive", "").strip().lower()
        if force in ("oui", "non"):
            tardive = force == "oui"
        else:
            tardive = bool(compo and enreg) and int(enreg) - int(compo) >= ECART_TARDIF
        cartes.append({
            "num": num,
            "id": r["id"],
            "titre": r["titre_carte"],
            "artistes": r["artistes"],
            "annee": compo or r["annee_album"],
            "annee_source": "composition" if compo else "album",
            "annee_album": r["annee_album"],
            "annee_version": enreg,
            "version_tardive": tardive,
            "pays": r["pays"],
            "langue": r["langue"],
            "causes": [c for c in r["cause"].split("|") if c],
            "contexte": r["contexte"],
            "explicite": r["explicite"] == "oui",
            "histoire": histoires.get(r["id"], {}).get("paragraphes", []),
            "histoire_statut": histoires.get(r["id"], {}).get("statut", ""),
            "sources": histoires.get(r["id"], {}).get("sources", []),
        })
    return cartes


def contenu_qr(carte, base_url):
    if base_url:
        return f"{base_url.rstrip('/')}/jouer.html#{carte['id']}"
    return f"https://open.spotify.com/track/{carte['id']}"


def faire_qr(donnees):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=4)
    qr.add_data(donnees)
    qr.make(fit=True)
    return qr


def ecrire_qr(cartes, base_url):
    DOSSIER_QR.mkdir(exist_ok=True)
    png_dir = DOSSIER_SORTIE / "png"
    png_dir.mkdir(parents=True, exist_ok=True)
    svgs = {}
    for c in cartes:
        donnees = contenu_qr(c, base_url)
        qr = faire_qr(donnees)
        modules = qr.modules_count + 2 * qr.border
        # SVG : un seul chemin, dimensions en mm.
        img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
        chemin_svg = DOSSIER_QR / f"{c['id']}.svg"
        img.save(str(chemin_svg))
        svgs[c["id"]] = chemin_svg.read_text(encoding="utf-8")
        # PNG : taille d'un module choisie pour approcher QR_MM à 300 dpi.
        box = max(1, round(QR_MM / 25.4 * DPI / modules))
        qr.box_size = box
        png = qr.make_image(fill_color="black", back_color="white")
        png.save(str(png_dir / f"{c['id']}.png"), dpi=(DPI, DPI))
        c["qr_version"] = qr.version
    return svgs


def taille_titre(titre):
    n = len(titre)
    if n <= 18:
        return 6.0
    if n <= 32:
        return 5.0
    if n <= 50:
        return 4.2
    return 3.4


def taille_artistes(texte):
    return 3.6 if len(texte) <= 40 else (3.0 if len(texte) <= 90 else 2.3)


def svg_inline(svg):
    # Retire la déclaration XML et force la taille au cadre de la carte.
    i = svg.find("<svg")
    svg = svg[i:]
    return svg.replace("<svg", '<svg class="qr"', 1)


def recto(c, svg):
    return f"""<div class="carte recto">
  <div class="marque">Chansons de lutte</div>
  {svg_inline(svg)}
  <div class="bas">{'<span class="tardive">' + SABLIER + 'Version tardive</span>' if c['version_tardive'] else ''}<span class="num">n° {c['num']}</span></div>
</div>"""


def verso(c):
    e = html.escape
    lieu = " · ".join(x for x in (c["pays"], c["langue"]) if x)
    if c["annee_source"] != "composition":
        annee_note = '<div class="alerte">date d\'album, à vérifier</div>'
    elif c["annee_version"] and c["annee_version"] != c["annee"]:
        annee_note = f'<div class="version">écrite en {e(c["annee"])} · cette version : {e(c["annee_version"])}</div>'
    elif c["version_tardive"]:
        annee_note = '<div class="version">cette version a été enregistrée bien plus tard</div>'
    else:
        annee_note = ""
    causes = " · ".join(c["causes"])
    explicite = '<span class="explicite">E</span>' if c["explicite"] else ""
    return f"""<div class="carte verso">
  <div class="lieu">{e(lieu)}</div>
  <div class="annee">{e(c['annee'])}</div>{annee_note}
  <div class="titre" style="font-size:{taille_titre(c['titre'])}mm">{e(c['titre'])}{explicite}</div>
  <div class="artistes" style="font-size:{taille_artistes(c['artistes'])}mm">{e(c['artistes'])}</div>
  <div class="contexte">{e(c['contexte'])}</div>
  <div class="pied"><span>{e(causes)}</span><span>n° {c['num']}</span></div>
</div>"""


CSS = f"""
@page {{ size: {CARTE}mm {CARTE}mm; margin: 0; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{ font-family: "Noto Sans", "Noto Sans CJK SC", "Noto Sans Arabic", "Noto Sans Hebrew", "DejaVu Sans", sans-serif; color: #111;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.carte {{ position: relative; width: {CARTE}mm; height: {CARTE}mm; overflow: hidden; break-after: page;
  padding: {FOND_PERDU + SECURITE}mm; background: #fff; }}
.carte:last-child {{ break-after: auto; }}
.recto {{ display: flex; flex-direction: column; align-items: center; justify-content: space-between; background: #b3261e; color: #fff; }}
.recto .marque {{ font-size: 4mm; letter-spacing: 0.5mm; text-transform: uppercase; font-weight: 700; }}
.recto .qr {{ width: {QR_MM}mm; height: {QR_MM}mm; background: #fff; border-radius: 2mm; }}
.recto .bas {{ display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 1mm; font-size: 3mm; min-height: 9mm; }}
.recto .tardive {{ display: inline-flex; align-items: center; gap: 1mm; font-weight: 700; background: #fff; color: #b3261e;
  border-radius: 3mm; padding: 0.6mm 2.2mm; font-size: 3mm; }}
.sablier {{ width: 3.6mm; height: 3.6mm; }}
.verso .version {{ font-size: 2.6mm; color: #555; }}
.verso {{ display: flex; flex-direction: column; align-items: center; text-align: center; }}
.verso .lieu {{ font-size: 3mm; text-transform: uppercase; letter-spacing: 0.2mm; color: #555; min-height: 3.5mm; }}
.verso .annee {{ font-size: 17mm; font-weight: 800; line-height: 1; margin: 3mm 0 1mm; color: #b3261e; }}
.verso .alerte {{ font-size: 2.4mm; color: #b3261e; border: 0.2mm solid #b3261e; padding: 0 1mm; }}
.verso .titre {{ font-weight: 700; margin-top: 3mm; line-height: 1.15; overflow-wrap: anywhere; }}
.verso .artistes {{ margin-top: 1.5mm; color: #333; line-height: 1.2; overflow-wrap: anywhere; }}
.verso .contexte {{ font-size: 2.6mm; margin-top: 2.5mm; color: #333; line-height: 1.3; flex: 1; overflow: hidden; }}
.verso .pied {{ width: 100%; display: flex; justify-content: space-between; font-size: 2.3mm; color: #777; gap: 2mm; text-align: left; }}
.explicite {{ display: inline-block; font-size: 2.2mm; border: 0.2mm solid #111; padding: 0 0.6mm; margin-left: 1mm; vertical-align: middle; }}
.repere {{ outline: 0.1mm solid #0a0; outline-offset: -{FOND_PERDU}mm; }}
.repere::after {{ content: ""; position: absolute; inset: {FOND_PERDU + SECURITE}mm; outline: 0.1mm dashed #08f; }}
"""


def ordre_impression(cartes, miroir=True):
    """Liste (carte, face, x_mm, y_mm, page) dans l'ordre des pages du PDF de cartes."""
    par_page = COLS * RANGS
    places = []
    for n, debut in enumerate(range(0, len(cartes), par_page)):
        lot = cartes[debut:debut + par_page]
        for k, c in enumerate(lot):
            rang, col = divmod(k, COLS)
            places.append((c, "recto", POS_X[col], POS_Y[rang], 2 * n))
        for k, c in enumerate(lot):
            rang, col = divmod(k, COLS)
            # Recto verso retourné sur le bord long : la colonne est inversée au verso.
            places.append((c, "verso", POS_X[COLS - 1 - col if miroir else col], POS_Y[rang], 2 * n + 1))
    return places


def html_cartes(places, svgs, reperes=False):
    """Une carte de 94 x 94 mm par page ; l'imposition sur SRA3 est faite ensuite."""
    morceaux = [recto(c, svgs[c["id"]]) if face == "recto" else verso(c) for c, face, *_ in places]
    doc = (f'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
           f'<title>Chansons de lutte — cartes</title><style>{CSS}</style></head>'
           f'<body>{"".join(morceaux)}</body></html>')
    if reperes:
        doc = doc.replace('class="carte ', 'class="carte repere ')
    return doc


def agrandir(doc, facteur):
    return re.sub(r"(\d+(?:\.\d+)?)mm", lambda m: f"{float(m.group(1)) * facteur:g}mm", doc)


def imposer(pdf_cartes, places, pdf_sortie):
    """Place chaque carte sur des planches SRA3 aux coordonnées exactes du gabarit."""
    from pypdf import PdfReader, PdfWriter, Transformation
    pt = 72 / 25.4
    lecteur = PdfReader(str(pdf_cartes))
    if len(lecteur.pages) != len(places):
        sys.exit(f"Le rendu a produit {len(lecteur.pages)} pages au lieu de {len(places)} : une carte déborde.")
    ecrivain = PdfWriter()
    nb_planches = max(p[4] for p in places) + 1
    planches = [ecrivain.add_blank_page(PAGE_L * pt, PAGE_H * pt) for _ in range(nb_planches)]
    cote = CARTE * pt
    for page_carte, (_, _, x, y, n) in zip(lecteur.pages, places):
        b = page_carte.mediabox
        # Mise à l'échelle exacte : la page carte devient un carré de 94 mm.
        t = (Transformation()
             .translate(-float(b.left), -float(b.bottom))
             .scale(cote / float(b.width), cote / float(b.height))
             .translate(x * pt, PAGE_H * pt - y * pt - cote))
        planches[n].merge_transformed_page(page_carte, t)
    for pl in planches:
        for boite in ("trimbox", "bleedbox", "cropbox"):
            setattr(pl, boite, pl.mediabox)
    with open(pdf_sortie, "wb") as f:
        ecrivain.write(f)
    return nb_planches


def trouver_chrome(explicite):
    candidats = [explicite, os.environ.get("CHROME")]
    candidats += [shutil.which(n) for n in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "msedge")]
    candidats += [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/opt/pw-browsers/chromium",
    ]
    for c in candidats:
        if c and Path(c).is_file():
            return c
    return None


def faire_pdf(html_path, pdf_path, chrome):
    cmd = [chrome, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
           f"--print-to-pdf={pdf_path}", html_path.resolve().as_uri()]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", help="encoder URL/jouer.html#id au lieu du lien Spotify")
    ap.add_argument("--sans-pdf", action="store_true")
    ap.add_argument("--chrome", help="chemin de Chrome ou Chromium pour le PDF")
    ap.add_argument("--sans-miroir", action="store_true",
                    help="versos aux mêmes colonnes que les rectos (retournement bord court ou imprimeur qui gère l'imposition)")
    ap.add_argument("--reperes", action="store_true",
                    help="épreuve de contrôle : trait de coupe (vert) et zone utile (bleu) dessinés, NE PAS envoyer à l'impression")
    args = ap.parse_args()

    cartes = lire_chansons()
    svgs = ecrire_qr(cartes, args.base_url)
    (RACINE / "cartes.json").write_text(json.dumps(cartes, ensure_ascii=False, indent=1), encoding="utf-8")

    DOSSIER_SORTIE.mkdir(exist_ok=True)
    html_path = DOSSIER_SORTIE / "cartes.html"
    places = ordre_impression(cartes, miroir=not args.sans_miroir)
    doc = html_cartes(places, svgs, reperes=args.reperes)
    html_path.write_text(doc, encoding="utf-8")
    rendu_path = DOSSIER_SORTIE / "cartes-rendu.html"
    rendu_path.write_text(agrandir(doc, RENDU), encoding="utf-8")
    print(f"{len(cartes)} cartes, {len(svgs)} QR codes (niveau H), {html_path.relative_to(RACINE)}")

    sans_compo = sum(1 for c in cartes if c["annee_source"] != "composition")
    if sans_compo:
        print(f"Attention : {sans_compo} cartes sans année de composition (année d'album affichée, exclues du mode solo).")
    print(f"{sum(1 for c in cartes if c['version_tardive'])} cartes marquées « version tardive » (écart ≥ {ECART_TARDIF} ans).")

    if args.sans_pdf:
        return
    chrome = trouver_chrome(args.chrome)
    if not chrome:
        sys.exit("Chrome/Chromium introuvable : passer --chrome CHEMIN.")
    pdf = DOSSIER_SORTIE / ("cartes-epreuve.pdf" if args.reperes else "cartes.pdf")
    brut = DOSSIER_SORTIE / "cartes-unitaires.pdf"
    faire_pdf(rendu_path, brut, chrome)
    rendu_path.unlink()
    n = imposer(brut, places, pdf)
    brut.unlink(missing_ok=True)
    print(f"PDF : {pdf.relative_to(RACINE)} ({n} pages SRA3 {PAGE_L} x {PAGE_H} mm = {n // 2} planches recto verso)")


if __name__ == "__main__":
    main()
