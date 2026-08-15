const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LibraryStore } = require('./desktop/store.js');
const packageConfig = require('./package.json');
const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert.match(packageConfig.scripts.dist, /--publish never/, 'La compilation CI ne doit pas publier implicitement avant l’étape GitHub Release.');
assert.match(htmlSource, /id="printSilhouetteColor"/, 'Le mode d’impression couleur doit être proposé.');
assert.match(htmlSource, /id="printSilhouetteWhiteEdges"/, 'Le mode noir avec arêtes blanches doit être proposé.');
assert.match(appSource, /pieceColor'\)\.addEventListener\('input'/, 'La couleur de la pièce sélectionnée doit être modifiable.');
assert.match(appSource, /previewSvg\(pieces, 'color'\)/, 'Les cartes de silhouettes doivent afficher les couleurs enregistrées.');
assert.match(appSource, /appendBlackSilhouette\(piecesLayer, pieces, '#ffffff'\)/, 'Les arêtes blanches doivent être rendues dans la silhouette noire.');

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
