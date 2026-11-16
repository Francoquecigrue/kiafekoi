# La Ménagerie — puzzles d'échecs féeriques

Jeu web mobile, sans dépendance. Ouvrir `index.html` ou publier via GitHub Pages
(`https://<compte>.github.io/kiafekoi/echecs-feeriques/`). Installable sur l'écran d'accueil (PWA).

Principe : chaque chapitre présente une pièce féerique (fiche interactive), puis 5 problèmes
« mat en N » où elle est indispensable. Finir un chapitre débloque la pièce suivante.

Pièces : Sauterelle, Chameau, Zèbre, Noctambule, Princesse, Impératrice, Kangourou, Amazone,
puis « Le Grand Bal » (deux pièces féeriques par problème).

## Fichiers
- `engine.js` : règles (coups légaux, échec, mat) et recherche de mat forcé.
- `pieces.js` : fiches des pièces (nom, icône, règles, position de démonstration).
- `puzzles.js` : problèmes, **générés** par `scripts/generate.js`.
- `app.js`, `index.html`, `style.css` : interface.

## Problèmes
Tous les problèmes sont générés et vérifiés par recherche exhaustive :
- mat forcé en N, pas de mat plus court ;
- premier coup unique ;
- la pièce féerique est indispensable : sans elle, ou remplacée par son équivalent
  classique (Princesse → Fou, Impératrice → Tour, Amazone → Dame, Noctambule → Cavalier), il n'y a plus de mat ;
- la pièce féerique joue le premier coup ou donne le mat.

En jeu, tout coup qui maintient un mat forcé est accepté ; les Noirs choisissent la défense la plus longue.

```
node scripts/generate.js 7   # régénère puzzles.js (graine 7)
node scripts/verify.js       # revérifie puzzles.js
```

Pour ajouter une pièce : la définir dans `TYPES` (`engine.js`), lui donner une fiche dans `pieces.js`,
un équivalent dans `ANALOG` et un chapitre dans `CHAPTERS` (`scripts/generate.js`).
