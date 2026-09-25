# 🔌 API REST

Base : `/api` — JSON en entrée comme en sortie. Les erreurs renvoient `{ "error": "message" }` avec le code HTTP adapté (400, 404, 405, 409, 413, 500).

| Méthode  | Route            | Description                                                                                                                  |
| -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`        | `{ status: "ok", version }`                                                                                                  |
| `GET`    | `/stats`         | Statistiques globales (parties, % victoires Blancs/Noirs, motifs de fin…)                                                    |
| `GET`    | `/heuristics`    | Types de calcul disponibles pour les bots                                                                                    |
| `GET`    | `/presets`       | Bots modèles                                                                                                                 |
| `GET`    | `/players?kind=` | Joueurs (`human` / `bot`)                                                                                                    |
| `POST`   | `/players`       | Crée un joueur : `{ name, kind, ranked?, bot?: { avatar, description, config } }`                                            |
| `GET`    | `/players/:id`   | Profil : joueur, rang, face-à-face, 20 dernières parties                                                                     |
| `PATCH`  | `/players/:id`   | `{ name?, ranked?, bot? }`                                                                                                   |
| `DELETE` | `/players/:id`   | Supprime le joueur (ses parties restent dans l'historique)                                                                   |
| `GET`    | `/leaderboard`   | `?kind=all\|human\|bot&includeUnranked=true&minGames=5&sort=rating\|peak\|performance\|winRate\|wins\|games\|streak&search=` |
| `GET`    | `/games`         | `?playerId=&limit=50&offset=0` (plus récentes d'abord)                                                                       |
| `GET`    | `/games/:id`     | Une partie (coups SAN, PGN, variations Elo)                                                                                  |
| `POST`   | `/games`         | Enregistre une partie terminée (voir ci-dessous)                                                                             |

## Enregistrer une partie

```http
POST /api/games
{
  "whiteId": "…",
  "blackId": "…",
  "moves": ["f3", "e5", "g4", "Qh4#"],
  "result": "0-1",
  "reason": "checkmate",
  "mode": "pvp"
}
```

- `moves` : SAN ou UCI ; le serveur **rejoue la partie** et refuse tout coup illégal.
- `reason` : `checkmate`, `stalemate`, `fifty-move`, `threefold`, `insufficient-material` (doivent correspondre à la position finale), `resignation` ou `agreement`.
- `mode` (optionnel) est vérifié contre le type des joueurs.

## Configuration d'un bot

```json
{
  "heuristics": [
    { "id": "material", "weight": 1 },
    { "id": "safety", "weight": 1.5 }
  ],
  "depth": 3,
  "quiescence": true,
  "randomness": 0
}
```

Toute configuration est normalisée côté serveur (bornes, calculs inconnus ignorés, au moins un calcul).
