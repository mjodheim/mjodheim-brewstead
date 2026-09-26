# Les objets des lieux, en volume

Les parcelles, les cultures, les ruches et les fûts des lieux, ainsi qu'une
partie des icônes, sont des rendus 3D faits avec three.js. Tout est décrit dans
`modeles.js` : la géométrie et les textures, sans aucun fichier extérieur.

Pour les refaire :

```sh
cd scripts/modeles
npm install
node rendre.mjs          # ou : node rendre.mjs ruche fut-pret
python3 assembler.py     # recadre, convertit en WebP, écrit dans static/images
```

`rendre.mjs` sert le dossier, ouvre `rendu.html?modele=…` dans Chromium sans
écran et enregistre le canevas en PNG transparent dans `sortie/`.
`assembler.py` recadre les rendus (les parcelles partagent un même cadre, pour
que la terre tombe au même endroit d'une image à l'autre) et écrit :

- `images/modeles/` : parcelle nue, quatre familles de cultures à trois stades
  (céréales, houblon, baies, herbes), ruche, ruche pleine, fût qui fermente,
  fût prêt, les récipients du comptoir (chope de bois, coupe de laiton,
  chope de verre) et l'abeille ;
- `images/objets/` : les icônes du jeu, 160 × 160.

Les icônes qui ne sont pas modelées ici viennent de
[Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (licence MIT, voir
`images/objets/LICENCE-fluent.txt`).

Si les proportions d'une image changent, reporter les repères utilisés par
`brewstead-scenes.js` (`PARCELLE_RATIO`, `SOMMETS`, `RUCHE`, `FUTS`).
