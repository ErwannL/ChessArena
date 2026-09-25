# Changelog

Toutes les évolutions notables de ce projet sont listées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) — versions : [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

## [1.0.0] — 2026-09-25

### Ajouté

- Moteur d'échecs complet (roque, en passant, promotion, mat, pat, 50 coups, triple répétition, matériel insuffisant), FEN, SAN, PGN — validé par perft.
- Modes **PvP**, **PvE** et **EvE** (séries de parties avec couleurs alternées, vitesse réglable, pause).
- Bots à **calculs paramétrables** : matériel, placement, mobilité, sécurité des pièces, centre, sécurité du roi, structure de pions, développement, agressivité, finale — pondérables, avec profondeur de recherche alpha-bêta, quiescence et part d'imprévu.
- 7 bots modèles, du Pousse-Bois au Grand Maître ; atelier de création/édition de bots.
- Classement **Elo** détaillé : tendance, pic, V/N/D, % de victoires, séries, performance, forme, filtres humains/bots/non-classés, tri, recherche ; profils avec graphique Elo et face-à-face.
- Historique et relecture des parties, export PGN.
- API REST Node sans dépendance, persistance JSON, validation des parties par rejeu.
- Mode hors-ligne automatique (localStorage).
- Interface responsive PC / tablette / téléphone, installable (PWA), échiquier tactile (tap et glisser-déposer).
- Image Docker multi-étapes non-root avec healthcheck, docker-compose.
- CI GitHub Actions (types, lint, format, 100 % de couverture, e2e desktop + mobile, build Docker), release automatique vers GHCR, Dependabot.

[Unreleased]: https://github.com/ErwannL/ChessArena/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ErwannL/ChessArena/releases/tag/v1.0.0
