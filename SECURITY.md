# Sécurité

Merci de **ne pas** ouvrir d'issue publique pour une faille : utilisez l'onglet
[Security → Report a vulnerability](https://github.com/ErwannL/ChessArena/security/advisories/new) du dépôt.

Mesures en place : corps de requête limités à 1 Mo, validation et normalisation de toutes les entrées,
rejeu des parties côté serveur, protection contre le path traversal, conteneur exécuté en utilisateur non-root.
L'application n'a pas d'authentification : exposez-la derrière un reverse proxy si elle est publique.
