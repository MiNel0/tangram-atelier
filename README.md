# Tangram Atelier

Éditeur Windows hors ligne pour créer, organiser et imprimer des tangrams à taille réelle.

## Installation

Téléchargez `Tangram-Atelier-1.0.0-Setup.exe`, puis double-cliquez dessus. L’installation crée automatiquement les raccourcis Bureau et menu Démarrer et lance l’application.

Les tangrams et silhouettes restent uniquement sur l’ordinateur, dans le dossier utilisateur de Tangram Atelier. Une mise à jour du logiciel ne les supprime pas.

## Développement

```powershell
npm install
npm start
```

Tests et installateur :

```powershell
npm test
npm run dist
```

## Publier une mise à jour

Après avoir validé les changements :

```powershell
npm version patch
git push origin main --follow-tags
```

Le tag déclenche GitHub Actions, qui construit et publie l’installateur. Les applications installées recherchent ensuite cette nouvelle version automatiquement.
