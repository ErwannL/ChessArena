# 🏗️ Architecture

ChessArena est écrit en **TypeScript de bout en bout**, sans framework côté client ni côté serveur :
le même code (moteur, bots, Elo, règles d'enregistrement) tourne dans le navigateur, dans un Web Worker et sur le serveur Node.

```mermaid
flowchart TB
  subgraph Navigateur["Navigateur (PC / tablette / téléphone)"]
    UI["web/ — PWA vanilla TS<br/>vues, échiquier tactile"]
    W["Web Worker<br/>réflexion des bots"]
    L[("localStorage<br/>mode hors-ligne")]
  end
  subgraph Serveur["Serveur Node (Docker)"]
    API["server/app.ts<br/>API REST + fichiers statiques"]
    DB[("/data/arena.json")]
  end
  subgraph Partage["src/ — code partagé, testé à 100 %"]
    E[engine<br/>règles, FEN, SAN, PGN]
    B[bots<br/>calculs + alpha-bêta]
    R[rating<br/>Elo]
    A[arena<br/>Repository : joueurs, parties, classement]
    C[client<br/>HttpApi / LocalApi, session]
  end
  UI --> C
  UI --> W
  W --> B
  C -- HTTP --> API
  C -. hors-ligne .-> L
  API --> A --> DB
  A --> E & R
  B --> E
```

## Arborescence

| Dossier      | Rôle                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine` | Règles complètes : roque, prise en passant, promotion, mat/pat, 50 coups, triple répétition, matériel insuffisant, FEN, SAN, PGN. Validé par **perft**. |
| `src/bots`   | Calculs (heuristiques), contexte d'évaluation partagé (carte d'attaques), recherche négamax alpha-bêta + quiescence, bots modèles.                      |
| `src/rating` | Elo (K variable, plancher, performance).                                                                                                                |
| `src/arena`  | `Repository` : création/édition de joueurs et bots, **validation des parties par rejeu**, statistiques détaillées, classement.                          |
| `src/client` | `HttpApi` (serveur), `LocalApi` (localStorage, mêmes règles), détection automatique, `GameSession`.                                                     |
| `server`     | Serveur HTTP Node natif : routes REST, persistance JSON atomique, SPA statique sécurisée (anti path-traversal).                                         |
| `web`        | Interface : échiquier (tap & glisser-déposer), jeu, atelier de bots, classement, profils, relecture.                                                    |
| `tests`      | Tests unitaires/intégration Vitest — **100 % lignes / branches / fonctions**.                                                                           |
| `e2e`        | Scénarios Playwright sur desktop et mobile.                                                                                                             |

## Choix techniques

- **Zéro dépendance d'exécution** : l'image Docker ne contient que `dist/` (bundle serveur de ~50 ko + client statique).
- **Réflexion des bots dans un Web Worker** : l'interface reste fluide sur téléphone même quand le Grand Maître calcule.
- **Mode hors-ligne** : si le serveur ne répond pas (hébergement statique, avion…), l'application bascule sur `LocalApi` qui applique exactement les mêmes règles.
- **Serveur autoritaire** : les parties sont rejouées coup par coup avant d'être comptées.
- **Performances** : carte d'attaques calculée une seule fois par position et partagée entre les calculs, tri MVV-LVA, fenêtre alpha-bêta à la racine, budget de nœuds.
