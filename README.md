# Étudia

Application web mobile-first, installable via un navigateur, pour accompagner l'étude : création de profil, cours générés ou issus de scans, conservation locale des cours et priorisation des révisions. L'interface ne contient aucune clé de fournisseur IA ou OCR.

## Fonctionnel aujourd'hui

- Onboarding, profil et stockage local persistant (`localStorage`).
- Création de cours depuis un titre et édition/relecture obligatoire du texte issu d'un scan.
- Ajout de plusieurs photos, réorganisation et suppression avant OCR.
- Navigation, recherche, consultation et suppression des cours.
- Écran de progression et moteur de priorisation des notions fragiles/à réviser.
- Couche `aiService` et `ocrService` isolée de l'interface, avec délais et messages utilisateur pour réseau, quotas et réponses invalides.

## Services à connecter

La génération IA, l'analyse des scans et les questions au tuteur requièrent un **serveur Étudia authentifié**. Sans configuration, l'application affiche explicitement un message et ne fabrique pas de contenu pédagogique.

Le serveur doit fournir :

- `POST /v1/ai/generate-course` → objet `{ title, sections, concepts? }`;
- `POST /v1/ocr/extract` → objet `{ text }`;
- `POST /v1/ai/analyze-course` → objet `{ title, sections, concepts? }`;
- `POST /v1/ai/answer` → objet `{ answer }`.

Il est responsable de l'authentification, des secrets fournisseur et de la validation. Les endpoints IA doivent garder le contenu original séparé du contenu généré, privilégier le cours fourni, et retourner des données structurées validables.

## Configuration

Copiez `.env.example` pour documenter votre URL de backend. Dans cette version sans chaîne de build, injectez cette valeur au déploiement avant `src/app.js` :

```html
<script>window.ETUDIA_API_URL = 'https://votre-serveur.example'</script>
```

`ETUDIA_API_URL` est la seule variable requise côté client. **Ne placez jamais une clé OpenAI/OCR dans ce dépôt ou dans le navigateur.**

## Lancer

```bash
npm start
# ouvrir http://localhost:4173
```

## Vérifier

```bash
npm test
```

## Limites restantes

Les quiz, exercices et flashcards doivent être retournés par le backend puis persister dans une base de données utilisateur : ils ne sont volontairement pas affichés comme faux contenus locaux. Ajouter un manifeste PWA, l'authentification serveur, le stockage synchronisé et les permissions natives caméra/photos est recommandé avant une publication mobile.
