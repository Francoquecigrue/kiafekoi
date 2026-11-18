# Chansons de lutte

Jeu de cartes musical sur des chansons de lutte du monde entier : chaque carte porte au recto un QR code renvoyant à un titre Spotify. Au verso figurent l'année, le titre, l'artiste, le pays, la langue et le contexte. Les joueurs écoutent, devinent l'année et placent la carte sur leur ligne du temps.

Projet indépendant, sans lien avec aucun jeu commercial existant.

## Contenu

| Fichier | Rôle |
|---|---|
| `data/source/Chansons_de_luttes_2.csv` | Export Spotify corrigé, **copie à l'identique, ne jamais modifier**. |
| `data/chansons.csv` | Fichier de travail, **à éditer à la main** (voir plus bas). |
| `outils/nettoyer.py` | Produit `data/chansons.csv` depuis la source (refuse d'écraser sans `--force`). |
| `outils/cartes.py` | Génère `qr/*.svg`, `sortie/png/*.png` (300 dpi), `cartes.json` et `sortie/cartes.pdf`. |
| `index.html`, `app.js` | Site : liste des cartes, révélation, filtres par pays, cause et langue. |
| `jouer.html`, `jouer.js`, `config.js` | Lecture à l'aveugle (Web Playback SDK ou appareil Spotify Connect). |
| `vendor/jsQR.js` | Lecture des QR codes par la caméra (licence Apache 2.0, `vendor/jsQR-LICENSE.txt`). |

## Le fichier de travail `data/chansons.csv`

Colonnes :

- `id`, `uri`, `isrc`, `titre_spotify`, `album`, `date_album`, `annee_album`, `explicite`, `duree_s`, `label`, `ligne_source` : issus de l'export Spotify (`ligne_source` = numéro de ligne dans le CSV 2).
- `titre_carte` : titre imprimé (suffixes « Remastered », « Live »… retirés). Modifiable.
- `artistes` : séparés par des virgules. À raccourcir si besoin (ex. « 11'30 contre les lois racistes »).
- `annee_composition` : **vide, à compléter**. C'est l'année imprimée en grand. Tant qu'elle est vide, la carte affiche l'année de l'album avec la mention « date d'album, à vérifier ».
- `pays`, `langue`, `cause` : **propositions à relire**, pas des données vérifiées. `pays` = pays ou région de la lutte évoquée, pas celui de l'interprète. Plusieurs causes séparées par `|`. Champ vide = inconnu.
- `contexte` : vide, texte court du verso (environ 200 caractères maximum).
- `verifie` : mettre `oui` une fois la ligne relue.
- `a_verifier` : remarques (dates placeholder, titres explicites, titres à discuter, Kino, Corse, Burning Spear).

Ouvrir et enregistrer en UTF-8 (LibreOffice : « Unicode (UTF-8) », séparateur virgule). Excel peut abîmer les caractères non latins.

## Générer les cartes

```bash
pip install -r outils/requirements.txt
python3 outils/cartes.py
```

Le PDF est rendu par Chrome, Chromium ou Edge en mode sans interface. Si le script ne le trouve pas : `--chrome /chemin/vers/chrome`, ou ouvrir `sortie/cartes.html` et imprimer en PDF (A4, marges : aucune, échelle 100 %).

Mise en page : A4, 9 cartes de 63 × 88 mm par page, traits de coupe dans les marges. Pages impaires = rectos (QR codes), pages paires = versos, rangées inversées pour une impression **recto verso, retournement sur le bord long**. Faire un essai sur une feuille avant tout tirage : l'alignement recto verso varie selon les imprimantes.

QR codes : correction d'erreur niveau H, 46 mm de côté, version 6. Les 100 QR codes ont été vérifiés par décodage du PDF et des PNG.

### Que contient le QR code ?

Par défaut : `https://open.spotify.com/track/<id>`. Ce choix ne dépend pas de l'adresse du site, donc les cartes imprimées restent valables si le site déménage. La page `jouer.html` lit ces QR codes par la caméra et lance le titre sans l'afficher.

Limite : scanné avec l'appareil photo du téléphone, le QR ouvre Spotify, qui **affiche le titre**. Pour jouer à l'aveugle, il faut scanner depuis `jouer.html`.

Option : `python3 outils/cartes.py --base-url https://<adresse-du-site>` encode `…/jouer.html#<id>`. Le scan par l'appareil photo ouvre alors directement la page de jeu. En contrepartie, les cartes sont liées à cette adresse.

## Voir le site en local

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Puis ouvrir http://127.0.0.1:8765/. L'ouverture directe du fichier (`file://`) ne charge pas `cartes.json`.

## Tester la lecture Spotify (compte Premium)

### Contraintes connues

- Application en mode développement : le compte du propriétaire doit être Premium ; seuls les comptes ajoutés dans « User Management » (5 au plus) peuvent se connecter.
- Lecture uniquement avec un compte Premium, aussi bien par le SDK que par Spotify Connect.
- **Le Web Playback SDK ne fonctionne pas sur les navigateurs mobiles** (iOS, Android). Sur téléphone, la page passe en mode « appareil Spotify » : elle pilote l'application Spotify du téléphone, qui joue le son et affiche le titre sur son propre écran. Il faut donc garder la page de jeu au premier plan.
- Aucun secret : le flux PKCE n'utilise que le Client ID, qui est public. Ne jamais mettre le « Client secret » dans le dépôt.

### 1. Créer l'application Spotify

1. https://developer.spotify.com/dashboard → « Create app ».
2. Nom et description libres. Ne pas utiliser de nom de marque de jeu existant.
3. Redirect URIs : ajouter **exactement** l'adresse affichée par la page `jouer.html` sous « URI de redirection ». Par exemple :
   - test local : `http://127.0.0.1:8765/jouer.html` (Spotify accepte `http` seulement pour l'adresse de bouclage `127.0.0.1`, pas pour `localhost`) ;
   - en ligne : `https://<utilisateur>.github.io/<dépôt>/jouer.html`.
4. « Which API/SDKs are you planning to use » : cocher **Web API** et **Web Playback SDK**.
5. Settings → User Management : ajouter le nom et l'adresse e-mail du compte Spotify Premium qui fera le test.
6. Copier le **Client ID**, pas le Client secret.

### 2. Dérouler le test sur ordinateur (Chrome, Firefox ou Edge)

1. Ouvrir `jouer.html` (en local ou en ligne), coller le Client ID, cliquer sur « Se connecter », accepter.
   - Attendu : « Connecté (compte premium) » et, dans le journal, « Lecteur prêt ».
2. Mode « Dans ce navigateur », « Carte au hasard », « Lire ».
   - Attendu : la musique joue, le disque tourne, aucun titre n'apparaît.
3. Vérifier que le titre n'apparaît pas non plus dans l'onglet, dans les contrôles multimédias du système (touches média, notification, écran verrouillé) ni dans la liste des appareils de l'application Spotify. Noter ce qui apparaît.
4. « Révéler » : la carte s'affiche.
5. « Scanner un QR code » avec une carte imprimée ou affichée sur un autre écran.

### 3. Dérouler le test sur téléphone

Uniquement sur le site en ligne, car la caméra exige HTTPS.

1. Ouvrir l'application Spotify sur le téléphone, puis `jouer.html` dans le navigateur.
2. Se connecter. Le mode « appareil Spotify » est sélectionné automatiquement.
3. « Actualiser », choisir le téléphone, scanner une carte, « Lire ».

### Lire le journal

| Message | Cause probable |
|---|---|
| `INVALID_CLIENT: Invalid redirect URI` (sur la page Spotify) | L'URI déclarée ne correspond pas exactement (http/https, chemin, barre finale). |
| `403` sur `/me` ou à la connexion | Compte absent de « User Management ». |
| `account_error` ou `403` sur `/me/player/play` | Compte non Premium. |
| `authentication_error` | Jeton expiré ou portée `streaming` refusée : se déconnecter puis se reconnecter. |
| `initialization_error` | Navigateur non pris en charge (mobile, navigateur intégré à une application). |
| `404` sur `/me/player/play` | Appareil inactif : la page retente après transfert ; sinon ouvrir l'application Spotify. |
| Aucun appareil trouvé (mode Connect) | Ouvrir l'application Spotify sur le téléphone et lancer un titre une fois. |

« Copier le journal » copie le texte, qui ne contient jamais le titre joué.
