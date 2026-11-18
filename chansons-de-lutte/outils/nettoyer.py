#!/usr/bin/env python3
"""Produit data/chansons.csv à partir de l'export Spotify corrigé.

- Ne modifie jamais les fichiers de data/source/.
- Retire les doublons décidés (lignes 29, 43 et 41 du CSV 2).
- Ajoute les colonnes de travail : année de composition (vide), pays, langue,
  cause, contexte, vérifié, à vérifier.
- Pays, langue et cause sont des PROPOSITIONS à relire (colonne « verifie » vide).
  Le pays est celui de la lutte évoquée, pas celui de l'interprète.

Usage : python3 outils/nettoyer.py [--force]
Le fichier de sortie est ensuite édité à la main : le script refuse de
l'écraser sans --force.
"""
import argparse
import csv
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "data" / "source" / "Chansons_de_luttes_2.csv"
SORTIE = RACINE / "data" / "chansons.csv"

# Lignes du CSV source (numérotation de l'éditeur, en-tête = ligne 1) à retirer,
# avec la ligne conservée correspondante. Vérifié par ISRC avant suppression.
DOUBLONS = {29: 23, 43: 27, 41: 31}

# Remarques décidées par l'utilisateur, par ligne source.
REMARQUES = {
    2: "date d'album placeholder (1990-01-01) : trouver la date de l'album",
    57: "date d'album placeholder (1990-01-01) : trouver la date de l'album",
    4: "date d'album placeholder (2007-01-01) : trouver la date de l'album",
    10: "date d'album placeholder (1996-01-01) : trouver la date de l'album",
    11: "date d'album placeholder (2005-01-01) : trouver la date de l'album",
    25: "date d'album placeholder (1970-01-01) : trouver la date de l'album",
    35: "date d'album placeholder (1997-01-01) : trouver la date de l'album",
    64: "date d'album placeholder (1976-01-01) : trouver la date de l'album",
    58: "titre explicite : écouter avant impression",
    92: "titre explicite : écouter avant impression",
    72: "à discuter : faible rapport à la lutte",
    68: "à discuter : faible rapport à la lutte",
    84: "à discuter : faible rapport à la lutte",
    79: "à discuter : faible rapport à la lutte",
    48: "à discuter : faible rapport à la lutte",
    17: "à discuter : faible rapport à la lutte",
    53: "à discuter : faible rapport à la lutte",
    90: "Kino : réintégrer « Хочу перемен » depuis le CSV 1 (ligne 90)",
    96: "Corse : décider du nombre de titres (5 à 10 ?) à reprendre du CSV 1",
    94: "Burning Spear : décision à prendre sur l'album",
    77: "chanson de Daniel Viglietti (Uruguay) interprétée par Víctor Jara",
}

# Propositions (ligne source -> début du titre attendu, pays, langue, cause).
# Plusieurs causes séparées par « | ». Champ vide = je ne sais pas.
P = {
    2: ("El pueblo unido", "Chili", "espagnol", "révolution|dictature et répression"),
    3: ("La retraite", "France", "français", "mouvement ouvrier"),
    4: ("L'estaca", "Espagne (Catalogne)", "catalan", "dictature et répression"),
    5: ("La semaine sanglante", "France", "français", "révolution"),
    6: ("Table ronde", "Congo (RDC)", "", "anticolonialisme"),
    7: ("Ah! Ca ira", "France", "français", "révolution"),
    8: ("Les canuts", "France", "français", "mouvement ouvrier"),
    9: ("La makhnovstchina", "Ukraine", "français", "anarchisme"),
    10: ("Bella Ciao", "Italie", "italien", "mouvement ouvrier|antifascisme"),
    11: ("Le chant des partisans", "France", "français", "antifascisme"),
    12: ("La Lega", "Italie", "italien", "mouvement ouvrier"),
    13: ("Les journées de Mai", "France", "français", "révolution"),
    14: ("No Pasaran", "Espagne", "espagnol", "antifascisme"),
    15: ("La Libertat", "France (Occitanie)", "occitan", ""),
    16: ("Arbetlozer marsh", "Pologne", "yiddish", "mouvement ouvrier"),
    17: ("Dire-gelt", "", "yiddish", ""),
    18: ("Prohibido Olvidar", "Amérique latine", "espagnol", "dictature et répression"),
    19: ("Leve Palestina", "Palestine", "suédois", "libération nationale"),
    20: ("La Libertat", "France (Occitanie)", "occitan", ""),
    21: ("El Paso del Ebro", "Espagne", "espagnol", "antifascisme"),
    22: ("Das Einheitsfrontlied", "Allemagne", "allemand", "mouvement ouvrier|antifascisme"),
    23: ("Hasta Siempre", "Cuba", "espagnol", "révolution"),
    24: ("La marseillaise de la commune", "France", "français", "révolution"),
    25: ("Bella ciao", "Italie", "italien", "antifascisme"),
    26: ("Miss Maggie", "France", "français", ""),
    27: ("Porcherie", "France", "français", "antifascisme"),
    28: ("Independance Cha-Cha", "Congo (RDC)", "lingala, français", "anticolonialisme"),
    30: ("Die Moorsoldaten", "Allemagne", "allemand", "antifascisme"),
    31: ("Debout les femmes", "France", "français", "féminisme"),
    32: ("Which Side", "États-Unis", "anglais", "mouvement ouvrier"),
    33: ("Tear The Fascists Down", "États-Unis", "anglais", "antifascisme"),
    34: ("Strange Fruit", "États-Unis", "anglais", "antiracisme"),
    35: ("Le déserteur", "France", "français", "antimilitarisme"),
    36: ("De Cuba traigo un cantar", "Cuba", "espagnol", "révolution"),
    37: ("Les Canuts", "France", "français", "mouvement ouvrier"),
    38: ("A la Huelga", "Espagne", "espagnol", "mouvement ouvrier|dictature et répression"),
    39: ("El Quinto Regimiento", "Espagne", "espagnol", "antifascisme"),
    40: ("Ay Carmela", "Espagne", "espagnol", "antifascisme"),
    42: ("Arroja la Bomba", "Espagne", "espagnol", "anarchisme"),
    44: ("Canción Sin Miedo", "Mexique", "espagnol", "féminisme"),
    45: ("Bread and Roses", "États-Unis", "anglais", "mouvement ouvrier|féminisme"),
    46: ("Soritis Petroulas", "Grèce", "grec", "dictature et répression"),
    47: ("L'appel du komintern", "International", "français", "révolution"),
    48: ("Santa Bárbara Bendita", "Espagne (Asturies)", "espagnol", "mouvement ouvrier"),
    49: ("Asma Asmaton", "Grèce", "grec", "antifascisme"),
    50: ("Les corons", "France", "français", "mouvement ouvrier"),
    51: ("L'affiche rouge", "France", "français", "antifascisme"),
    52: ("Sunday Bloody Sunday", "Irlande du Nord", "anglais", "dictature et répression"),
    53: ("Born in the U.S.A.", "États-Unis", "anglais", "antimilitarisme"),
    54: ("Zombie", "Irlande du Nord", "anglais", "antimilitarisme"),
    55: ("Bandiera Rossa", "Italie", "italien", "mouvement ouvrier"),
    56: ("The Foggy Dew", "Irlande", "anglais", "libération nationale"),
    57: ("Venceremos", "Chili", "espagnol", "révolution"),
    58: ("Arizona", "", "", ""),
    59: ("Grândola", "Portugal", "portugais", "dictature et répression"),
    60: ("Asimbonanga", "Afrique du Sud", "anglais, zoulou", "antiracisme"),
    61: ("The Wearing of the Green", "Irlande", "anglais", "libération nationale"),
    62: ("Tanbou Lou", "", "", ""),
    63: ("A Luta Continua", "Mozambique", "", "anticolonialisme"),
    64: ("Zombie", "Nigeria", "anglais (pidgin)", "dictature et répression"),
    65: ("Liberez-L_Algerie", "Algérie", "", ""),
    66: ("A Piece of Ground", "Afrique du Sud", "anglais", "anticolonialisme"),
    67: ("سرود آزادی", "", "persan", ""),
    68: ("Sodade", "Cap-Vert", "créole capverdien", "exil"),
    69: ("11'30 contre les lois racistes", "France", "français", "antiracisme"),
    70: ("Nicaraguita", "Nicaragua", "espagnol", "révolution"),
    71: ("En la plaza de mi pueblo", "Espagne", "espagnol", "mouvement ouvrier"),
    72: ("We Are The World", "Éthiopie", "anglais", "solidarité"),
    73: ("La Varsovienne", "Pologne", "", "mouvement ouvrier"),
    74: ("La Libertat", "France (Occitanie)", "occitan", ""),
    75: ("This Is Not a Song", "États-Unis", "anglais", ""),
    76: ("Adékalom", "France (La Réunion)", "créole réunionnais", ""),
    77: ("A Desalambrar", "Uruguay", "espagnol", "monde paysan"),
    78: ("A Las Barricadas", "Espagne", "espagnol", "anarchisme"),
    79: ("Cinturini", "Italie", "italien", "mouvement ouvrier"),
    80: ("El Payandé", "Pérou", "espagnol", ""),
    81: ("Kan Ar Kann", "France (Bretagne)", "", ""),
    82: ("Shosholoza", "Afrique du Sud", "", "mouvement ouvrier"),
    83: ("Sin pan", "Espagne", "espagnol", "antifascisme"),
    84: ("Casca l'uliva", "Italie", "", ""),
    85: ("Die Gedanken Sind Frei", "Allemagne", "allemand", "dictature et répression"),
    86: ("Dissan Na M'bera", "Guinée-Bissau", "", ""),
    87: ("Mona Ki Ngi Xica", "Angola", "kimbundu", "anticolonialisme"),
    88: ("TERITORYO", "Philippines", "", ""),
    89: ("Apesar de Você", "Brésil", "portugais", "dictature et répression"),
    90: ("Электричка", "URSS", "russe", ""),
    91: ("Treaty", "Australie", "anglais, yolŋu matha", "peuples autochtones"),
    92: ("Guevara Mate", "", "", ""),
    93: ("임을 위한 행진곡", "Corée du Sud", "coréen", "dictature et répression"),
    94: ("Slavery Days", "Jamaïque", "anglais", "antiracisme"),
    95: ("Ey Reqîb", "Kurdistan", "kurde", "libération nationale"),
    96: ("Bandera", "France (Corse)", "corse", "langues et peuples minorisés"),
    97: ("Nkosi Sikelel'i Afrika", "Afrique du Sud", "xhosa", "antiracisme"),
    98: ("Di shvu'e", "Empire russe", "yiddish", "mouvement ouvrier"),
    99: ("Joe Hill", "États-Unis", "anglais", "mouvement ouvrier"),
    100: ("La carmagnole", "France", "français", "révolution"),
    101: ("Bayan Ko", "Philippines", "tagalog", "dictature et répression|anticolonialisme"),
    102: ("Baraye", "Iran", "persan", "dictature et répression|féminisme"),
    103: ("Podustunna Poddunadugu", "Inde", "télougou", ""),
    104: ("一无所有", "Chine", "mandarin", "dictature et répression"),
}

COLONNES = [
    "id", "uri", "isrc", "titre_spotify", "titre_carte", "artistes", "album",
    "date_album", "annee_album", "annee_composition", "pays", "langue", "cause",
    "contexte", "explicite", "duree_s", "label", "ligne_source", "verifie",
    "a_verifier",
]

SUFFIXES = (" - Remastered", " - Remasterisé", " - Live", " - Stereo Version")


def titre_carte(titre):
    for s in SUFFIXES:
        i = titre.find(s)
        if i > 0:
            titre = titre[:i]
    return titre.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="écraser data/chansons.csv")
    args = ap.parse_args()
    if SORTIE.exists() and not args.force:
        sys.exit(f"{SORTIE} existe déjà (édité à la main ?). Relancer avec --force pour l'écraser.")

    with SOURCE.open(encoding="utf-8-sig", newline="") as f:
        lignes = list(csv.DictReader(f))
    par_ligne = {i + 2: r for i, r in enumerate(lignes)}  # en-tête = ligne 1

    for retiree, gardee in DOUBLONS.items():
        a, b = par_ligne[retiree], par_ligne[gardee]
        if a["ISRC"].upper() != b["ISRC"].upper():
            sys.exit(f"Lignes {retiree}/{gardee} : ISRC différents, suppression annulée.")

    sortie, vus = [], set()
    for n, r in par_ligne.items():
        if n in DOUBLONS:
            continue
        uri = r["Track URI"].strip()
        if not uri.startswith("spotify:track:"):
            sys.exit(f"Ligne {n} : URI inattendue {uri!r}")
        tid = uri.split(":")[-1]
        isrc = r["ISRC"].strip().upper()
        for cle in (tid, isrc):
            if cle in vus:
                sys.exit(f"Ligne {n} : doublon non prévu ({cle})")
            vus.add(cle)

        attendu, pays, langue, cause = P.get(n, ("", "", "", ""))
        if attendu and not r["Track Name"].startswith(attendu):
            sys.exit(f"Ligne {n} : titre {r['Track Name']!r} ≠ proposition {attendu!r}")

        date = r["Release Date"].strip()
        remarques = []
        if n in REMARQUES:
            remarques.append(REMARQUES[n])
        elif date.endswith("-01-01"):
            remarques.append("date au 1er janvier : placeholder probable")
        if len(date) == 4:
            remarques.append("date d'album réduite à l'année")

        sortie.append({
            "id": tid,
            "uri": uri,
            "isrc": isrc,
            "titre_spotify": r["Track Name"],
            "titre_carte": titre_carte(r["Track Name"]),
            "artistes": r["Artist Name(s)"].replace(";", ", "),
            "album": r["Album Name"],
            "date_album": date,
            "annee_album": date[:4],
            "annee_composition": "",
            "pays": pays,
            "langue": langue,
            "cause": cause,
            "contexte": "",
            "explicite": "oui" if r["Explicit"].strip().lower() == "true" else "non",
            "duree_s": round(int(r["Duration (ms)"]) / 1000),
            "label": r["Record Label"],
            "ligne_source": n,
            "verifie": "",
            "a_verifier": " ; ".join(remarques),
        })

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    with SORTIE.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLONNES)
        w.writeheader()
        w.writerows(sortie)
    print(f"{len(lignes)} lignes lues, {len(DOUBLONS)} doublons retirés, {len(sortie)} titres écrits dans {SORTIE.relative_to(RACINE)}")


if __name__ == "__main__":
    main()
