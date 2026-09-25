# Contribuer à ChessArena

Merci ! ♞

## Démarrer

```bash
git clone https://github.com/ErwannL/ChessArena.git && cd ChessArena
npm install
npm run dev          # API sur :3000 + client Vite sur :5173 (accessible depuis le téléphone sur le réseau local)
```

## Avant d'ouvrir une PR

```bash
npm run check        # types + lint + format + tests avec 100 % de couverture obligatoire
npm run build && npm run e2e   # si l'interface est touchée
```

- Une branche par sujet (`feat/…`, `fix/…`), commits en [Conventional Commits](https://www.conventionalcommits.org/fr/).
- Tout code dans `src/` ou `server/` doit rester couvert à **100 %** (lignes, branches, fonctions).
- Remplissez le modèle de PR ; la CI doit être verte.

Voir aussi [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) et, pour ajouter un type de calcul aux bots, [docs/BOTS.md](docs/BOTS.md#-ajouter-un-nouveau-type-de-calcul).
