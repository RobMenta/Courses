# Liste de course (PWA) — GitHub Pages + IA (via backend)

Cette web app te permet :
- ✅ cocher des produits
- 💶 saisir un prix unitaire
- 🔢 choisir une quantité
- ➕ total automatique (prix × quantité sur les produits cochés)
- ↕️ réordonner par glisser-déposer (mobile + desktop)
- 💾 sauvegarde locale (localStorage)
- 🧠 modules IA (recettes + budget) via un backend (Worker), **sans jamais exposer ta clé API côté client**

---

## 1) Mise en ligne sur GitHub Pages

1. Crée un nouveau repo GitHub (ex: `ma-liste-de-course`)
2. Mets ces fichiers à la racine :
   - `index.html`
   - `styles.css`
   - `app.js`
   - `manifest.webmanifest`
   - `sw.js`
   - dossier `assets/` (icônes)
3. Sur GitHub: **Settings → Pages**
   - Source: `Deploy from a branch`
   - Branch: `main` / `(root)`
4. Ouvre l’URL GitHub Pages.

### Ajouter à l’écran d’accueil
- **iPhone (Safari)** : Partager → “Sur l’écran d’accueil”
- **Android (Chrome)** : Menu → “Ajouter à l’écran d’accueil”

---

## 2) IA : IMPORTANT (clé API)

Ne mets **jamais** une clé OpenAI (ou autre) dans `app.js` : une PWA sur GitHub Pages est publique.

👉 Utilise un backend minimal (Cloudflare Worker / Vercel / Netlify…) et stocke la clé en secret côté serveur.

Dans ce repo, tu as un exemple Cloudflare Worker dans `worker/`.

---

## 3) Backend Cloudflare Worker (exemple)

### Prérequis
- Node.js installé
- un compte Cloudflare
- Wrangler (CLI)

### Démarrage rapide (Worker)
1. Va dans le dossier `worker/`
2. Installe Wrangler (si besoin) :
   ```bash
   npm i -g wrangler
