const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LibraryStore } = require('./desktop/store.js');
const Library = require('./library.js');
const packageConfig = require('./package.json');
const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const desktopMainSource = fs.readFileSync(path.join(__dirname, 'desktop', 'main.js'), 'utf8');

assert.match(packageConfig.scripts.dist, /--publish never/, 'La compilation CI ne doit pas publier implicitement avant l’étape GitHub Release.');
assert.match(htmlSource, /id="printSilhouetteColor"/, 'Le mode d’impression couleur doit être proposé.');
assert.match(htmlSource, /id="printSilhouetteWhiteEdges"/, 'Le mode noir avec arêtes blanches doit être proposé.');
assert.match(appSource, /pieceColor'\)\.addEventListener\('input'/, 'La couleur de la pièce sélectionnée doit être modifiable.');
assert.match(appSource, /previewSvg\(pieces, 'color'\)/, 'Les cartes de silhouettes doivent afficher les couleurs enregistrées.');
assert.match(appSource, /appendBlackSilhouette\(piecesLayer, pieces, '#ffffff'\)/, 'Les arêtes blanches doivent être rendues dans la silhouette noire.');
const backwardNavigationSource = appSource.match(/function unlockComposition[\s\S]+?function navigateTo[\s\S]+?if \(target === 'silhouette'\)/)?.[0] || '';
assert.doesNotMatch(backwardNavigationSource, /state\.silhouettes\s*=\s*\[\]/, 'Revenir aux étapes précédentes ne doit pas supprimer les silhouettes.');
assert.match(appSource, /function generateComposition\(\)[\s\S]+?confirm\('Modifier la composition supprimera les silhouettes existantes\./, 'La suppression ne doit être proposée qu’au moment de régénérer la composition.');
assert.match(desktopMainSource, /autoUpdater\.autoDownload\s*=\s*true/, 'Les mises à jour doivent être téléchargées automatiquement.');
assert.match(desktopMainSource, /autoUpdater\.autoInstallOnAppQuit\s*=\s*true/, 'Les mises à jour téléchargées doivent être installées automatiquement à la fermeture.');
assert.match(desktopMainSource, /setInterval\(check, UPDATE_CHECK_INTERVAL_MS\)/, 'Une application laissée ouverte doit rechercher périodiquement les mises à jour.');
assert.doesNotMatch(desktopMainSource, /update-downloaded[\s\S]+?showMessageBox/, 'Aucune confirmation ne doit bloquer l’installation automatique.');

const groupedProject = Library.projects([
  { id: 'recent', updatedAt: 2, project: { side: 140, seed: 'test', composition: [{ id: 'recent-piece', sourceId: 'recent-source', type: 'triangle', x: 0 }], silhouettes: [{ pieces: [{ sourceId: 'recent-source' }] }] } },
  { id: 'older', updatedAt: 1, project: { side: 140, seed: 'test', composition: [{ id: 'older-piece', sourceId: 'older-source', type: 'triangle', x: 0 }], silhouettes: [{ pieces: [{ sourceId: 'older-source' }] }] } },
])[0];
assert.deepEqual(groupedProject.project.silhouettes.map((item) => item.pieces[0].sourceId), ['recent-source', 'recent-source'], 'Les silhouettes regroupées doivent référencer la composition commune.');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tangram-desktop-'));
try {
  const file = path.join(folder, 'library.json');
  const store = new LibraryStore(file);
  store.upsert({ id: 'chat', name: 'Chat', updatedAt: 1, project: {} });
  store.upsert({ id: 'oiseau', name: 'Oiseau', updatedAt: 2, project: {} });
  store.upsert({ id: 'chat', name: 'Chat modifié', updatedAt: 3, project: {} });
  assert.deepEqual(new LibraryStore(file).read().map((item) => item.id), ['chat', 'oiseau']);
  store.remove('chat');
  assert.deepEqual(new LibraryStore(file).read().map((item) => item.id), ['oiseau']);
  console.log('Tests du logiciel Windows réussis.');
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
}
