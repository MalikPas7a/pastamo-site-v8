# Mise en ligne : sécurité du serveur

Le site est aujourd'hui publié sur GitHub Pages, qui ne permet pas d'ajouter des en-têtes HTTP.
La page contient donc déjà sa politique de sécurité (balise `Content-Security-Policy` dans `index.html`) :
seuls nos propres fichiers et les polices Google peuvent être chargés.

Si le site passe sur un autre hébergement (nom de domaine pastamo.ch, par exemple), utiliser le fichier correspondant :

| Hébergement | Fichier | Où le mettre |
|---|---|---|
| Apache (la plupart des hébergeurs mutualisés) | `.htaccess` | à la racine du site publié |
| Nginx | `nginx.conf` | à inclure dans le bloc `server { … }` |
| Netlify / Cloudflare Pages | `_headers` | à la racine du site publié |

Ces fichiers ajoutent, en plus de la politique de sécurité :
- **HSTS** (le navigateur n'utilise plus que HTTPS) : à activer seulement une fois le HTTPS en place sur le domaine ;
- **anti-clickjacking** (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) : le site ne peut pas être affiché dans le cadre d'un autre site ;
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, et un cache long pour les vidéos et images.

Le formulaire ne passe par aucun serveur : il prépare un e-mail dans la messagerie du visiteur.
Il n'y a donc ni base de données ni injection SQL possible. Les champs sont limités en longueur et nettoyés,
jamais insérés comme du HTML, et un champ piège invisible écarte les robots.
