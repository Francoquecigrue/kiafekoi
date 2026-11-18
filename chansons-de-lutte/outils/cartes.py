#!/usr/bin/env python3
"""Génère les QR codes, les données du site et le PDF imprimable des cartes.

Entrée : data/chansons.csv
Sorties :
  qr/<id>.svg            QR codes vectoriels (utilisés par le site et le PDF)
  sortie/png/<id>.png    QR codes PNG 300 dpi
  cartes.json            données du site
  sortie/cartes.html     mise en page d'impression (A4, 9 cartes par page)
  sortie/cartes.pdf      PDF recto verso, rendu par Chrome ou Chromium

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
import os
import shutil
import subprocess
import sys
from pathlib import Path

import qrcode
import qrcode.image.svg

RACINE = Path(__file__).resolve().parent.parent
CSV = RACINE / "data" / "chansons.csv"
DOSSIER_QR = RACINE / "qr"
DOSSIER_SORTIE = RACINE / "sortie"

CARTE_L, CARTE_H = 63, 88  # mm, format poker
COLS, RANGS = 3, 3
PAGE_L, PAGE_H = 210, 297  # A4
MARGE_X = (PAGE_L - COLS * CARTE_L) / 2  # 10,5 mm
MARGE_Y = (PAGE_H - RANGS * CARTE_H) / 2  # 16,5 mm
QR_MM = 46
DPI = 300


def lire_chansons():
    with CSV.open(encoding="utf-8", newline="") as f:
        lignes = list(csv.DictReader(f))
    lignes.sort(key=lambda r: int(r["ligne_source"]))
    cartes = []
    for num, r in enumerate(lignes, 1):
        compo = r["annee_composition"].strip()
        cartes.append({
            "num": num,
            "id": r["id"],
            "titre": r["titre_carte"],
            "artistes": r["artistes"],
            "annee": compo or r["annee_album"],
            "annee_source": "composition" if compo else "album",
            "annee_album": r["annee_album"],
            "pays": r["pays"],
            "langue": r["langue"],
            "causes": [c for c in r["cause"].split("|") if c],
            "contexte": r["contexte"],
            "explicite": r["explicite"] == "oui",
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
        return 5.2
    if n <= 32:
        return 4.3
    if n <= 50:
        return 3.6
    return 3.0


def taille_artistes(texte):
    return 3.2 if len(texte) <= 40 else (2.6 if len(texte) <= 90 else 2.0)


def svg_inline(svg):
    # Retire la déclaration XML et force la taille au cadre de la carte.
    i = svg.find("<svg")
    svg = svg[i:]
    return svg.replace("<svg", '<svg class="qr"', 1)


def recto(c, svg):
    return f"""<div class="carte recto">
  <div class="marque">Chansons de lutte</div>
  {svg_inline(svg)}
  <div class="num">n° {c['num']}</div>
</div>"""


def verso(c):
    e = html.escape
    lieu = " · ".join(x for x in (c["pays"], c["langue"]) if x)
    annee_note = "" if c["annee_source"] == "composition" else '<div class="alerte">date d\'album, à vérifier</div>'
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


def reperes():
    """Traits de coupe dans les marges de la page."""
    traits = []
    xs = [MARGE_X + i * CARTE_L for i in range(COLS + 1)]
    ys = [MARGE_Y + i * CARTE_H for i in range(RANGS + 1)]
    for x in xs:
        traits.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{MARGE_Y - 2}"/>')
        traits.append(f'<line x1="{x}" y1="{PAGE_H - MARGE_Y + 2}" x2="{x}" y2="{PAGE_H}"/>')
    for y in ys:
        traits.append(f'<line x1="0" y1="{y}" x2="{MARGE_X - 2}" y2="{y}"/>')
        traits.append(f'<line x1="{PAGE_L - MARGE_X + 2}" y1="{y}" x2="{PAGE_L}" y2="{y}"/>')
    return (f'<svg class="reperes" viewBox="0 0 {PAGE_L} {PAGE_H}" '
            f'stroke="#000" stroke-width="0.15">{"".join(traits)}</svg>')


CSS = f"""
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{ font-family: "Noto Sans", "Noto Sans CJK SC", "Noto Sans Arabic", "Noto Sans Hebrew", "DejaVu Sans", sans-serif; color: #111; }}
.page {{ width: {PAGE_L}mm; height: {PAGE_H}mm; position: relative; overflow: hidden; break-after: page; }}
.page:last-child {{ break-after: auto; }}
.reperes {{ position: absolute; inset: 0; width: {PAGE_L}mm; height: {PAGE_H}mm; }}
.grille {{ position: absolute; left: {MARGE_X}mm; top: {MARGE_Y}mm; display: grid;
  grid-template-columns: repeat({COLS}, {CARTE_L}mm); grid-template-rows: repeat({RANGS}, {CARTE_H}mm); }}
.carte {{ width: {CARTE_L}mm; height: {CARTE_H}mm; outline: 0.1mm dashed #ccc; outline-offset: -0.05mm;
  position: relative; overflow: hidden; padding: 4mm; }}
.vide {{ outline: none; }}
.recto {{ display: flex; flex-direction: column; align-items: center; justify-content: space-between; background: #b3261e; color: #fff; }}
.recto .marque {{ font-size: 3.2mm; letter-spacing: 0.4mm; text-transform: uppercase; font-weight: 700; }}
.recto .qr {{ width: {QR_MM}mm; height: {QR_MM}mm; background: #fff; border-radius: 1.5mm; }}
.recto .num {{ font-size: 2.6mm; }}
.verso {{ display: flex; flex-direction: column; align-items: center; text-align: center; }}
.verso .lieu {{ font-size: 2.6mm; text-transform: uppercase; letter-spacing: 0.2mm; color: #555; min-height: 3mm; }}
.verso .annee {{ font-size: 15mm; font-weight: 800; line-height: 1; margin: 5mm 0 1mm; color: #b3261e; }}
.verso .alerte {{ font-size: 2.2mm; color: #b3261e; border: 0.2mm solid #b3261e; padding: 0 1mm; }}
.verso .titre {{ font-weight: 700; margin-top: 4mm; line-height: 1.15; overflow-wrap: anywhere; }}
.verso .artistes {{ margin-top: 1.5mm; color: #333; line-height: 1.2; overflow-wrap: anywhere; }}
.verso .contexte {{ font-size: 2.4mm; margin-top: 3mm; color: #333; line-height: 1.3; flex: 1; overflow: hidden; }}
.verso .pied {{ width: 100%; display: flex; justify-content: space-between; font-size: 2.1mm; color: #777; gap: 2mm; text-align: left; }}
.explicite {{ display: inline-block; font-size: 2mm; border: 0.2mm solid #111; padding: 0 0.6mm; margin-left: 1mm; vertical-align: middle; }}
"""


def mise_en_page(cartes, svgs):
    par_page = COLS * RANGS
    pages = []
    for debut in range(0, len(cartes), par_page):
        lot = cartes[debut:debut + par_page]
        lot_complet = lot + [None] * (par_page - len(lot))
        rectos = [recto(c, svgs[c["id"]]) if c else '<div class="carte vide"></div>' for c in lot_complet]
        # Verso : chaque rang est inversé pour une impression recto verso
        # retournée sur le bord long.
        versos = []
        for r in range(RANGS):
            rang = lot_complet[r * COLS:(r + 1) * COLS][::-1]
            versos += [verso(c) if c else '<div class="carte vide"></div>' for c in rang]
        for contenu in (rectos, versos):
            pages.append(f'<section class="page">{reperes()}<div class="grille">{"".join(contenu)}</div></section>')
    return (f'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
            f'<title>Chansons de lutte — cartes</title><style>{CSS}</style></head>'
            f'<body>{"".join(pages)}</body></html>')


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
    args = ap.parse_args()

    cartes = lire_chansons()
    svgs = ecrire_qr(cartes, args.base_url)
    (RACINE / "cartes.json").write_text(json.dumps(cartes, ensure_ascii=False, indent=1), encoding="utf-8")

    DOSSIER_SORTIE.mkdir(exist_ok=True)
    html_path = DOSSIER_SORTIE / "cartes.html"
    html_path.write_text(mise_en_page(cartes, svgs), encoding="utf-8")
    print(f"{len(cartes)} cartes, {len(svgs)} QR codes (niveau H), {html_path.relative_to(RACINE)}")

    sans_compo = sum(1 for c in cartes if c["annee_source"] != "composition")
    if sans_compo:
        print(f"Attention : {sans_compo} cartes sans année de composition (année d'album affichée).")

    if args.sans_pdf:
        return
    chrome = trouver_chrome(args.chrome)
    if not chrome:
        sys.exit("Chrome/Chromium introuvable : ouvrir sortie/cartes.html et imprimer en PDF (A4, marges : aucune, échelle 100 %), ou passer --chrome.")
    pdf = DOSSIER_SORTIE / "cartes.pdf"
    faire_pdf(html_path, pdf, chrome)
    print(f"PDF : {pdf.relative_to(RACINE)}")


if __name__ == "__main__":
    main()
