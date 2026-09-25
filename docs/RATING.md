# 🏆 Classement Elo

## Formule

Pour une partie entre A et B :

- score attendu : `E_A = 1 / (1 + 10^((R_B − R_A) / 400))`
- nouveau classement : `R'_A = R_A + K × (S_A − E_A)` avec `S_A ∈ {1, ½, 0}`
- **K** (proche de la FIDE) : 40 pendant les 30 premières parties, 20 ensuite, 10 au-delà de 2400
- plancher : 100

Les humains commencent à **1200**. Un nouveau bot reçoit un classement **estimé à partir de sa configuration** (profondeur, nombre de calculs, quiescence, imprévu) pour ne pas fausser le classement au départ.

## Parties classées ou amicales

| Situation                                           | Enregistrée | Elo modifié |
| --------------------------------------------------- | ----------- | ----------- |
| Deux joueurs enregistrés et classés                 | ✅          | ✅          |
| Un des joueurs est « non classé » (ex. un bot test) | ✅          | ❌          |
| Un invité participe                                 | ❌          | ❌          |

Chaque joueur (humain **ou bot**) peut être retiré du classement ou y être remis depuis son profil ou l'atelier.
Le serveur **rejoue tous les coups** avant d'accepter un résultat : impossible d'enregistrer un mat qui n'en est pas un.

## Ce que détaille le classement

| Colonne              | Détail                                                               |
| -------------------- | -------------------------------------------------------------------- |
| Elo + tendance       | Classement actuel et variation sur les 5 dernières parties           |
| Pic / plancher       | Meilleur et pire classement atteints                                 |
| V / N / D            | Victoires, nulles, défaites — aussi séparées Blancs / Noirs (profil) |
| % de victoires       | Barre verte (V) / grise (N) / rouge (D)                              |
| Série                | 🔥 victoires ou ❄️ défaites consécutives en cours + meilleure série  |
| Performance          | `moyenne des adversaires + 400 × (V − D) / parties`                  |
| Forme                | 5 derniers résultats                                                 |
| Face-à-face (profil) | Bilan contre chaque adversaire                                       |
| Graphique (profil)   | Évolution de l'Elo sur les 100 dernières parties                     |

Filtres : tous / humains / bots, inclure les non-classés, nombre minimal de parties, recherche, 7 critères de tri.
