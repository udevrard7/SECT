# Politique de sécurité

## Versions prises en charge

SECT est en développement actif : seule la dernière version de la branche
`main` est prise en charge.

| Branche | Prise en charge |
| ------- | --------------- |
| main    | ✅              |

## Signaler une vulnérabilité

⚠️ **Ne créez pas de ticket public pour une faille de sécurité.**

Écrivez à **ulrichdouh@gmail.com** en décrivant :

- le composant concerné (frontend web / backend API / mobile / desktop) ;
- les étapes de reproduction ou une preuve de concept ;
- l'impact estimé (fuite de données, élévation de privilèges, paiement, etc.).

Objectif de réponse : 72 h. Merci de ne pas divulguer publiquement avant
qu'un correctif soit publié.

## Périmètre

- Frontend web (Vercel — `sect.ftci.fr`)
- Backend API (Render — `sect-zead.onrender.com`)
- Applications mobile (Kotlin Multiplatform) et desktop (Wails)
- Migrations et schéma de base (Neon PostgreSQL)

Hors périmètre : les plateformes elles-mêmes (Cloudflare, Neon, Vercel,
Render) — contactez directement ces éditeurs.
