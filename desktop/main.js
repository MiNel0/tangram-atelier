const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { LibraryStore } = require('./store.js');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};

let server;
let mainWindow;

function send(response, status, body, type = 'application/json; charset=utf-8') {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body);
  response.writeHead(status, { 'Content-Type': type, 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
  response.end(content);
}

function createServer(root, store) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/library' && request.method === 'GET') {
      send(response, 200, JSON.stringify(store.read()));
      return;
    }
    if (url.pathname === '/api/library' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; if (body.length > 5 * 1024 * 1024) request.destroy(); });
      request.on('end', () => {
        try { store.upsert(JSON.parse(body)); send(response, 200, '{"ok":true}'); }
        catch { send(response, 400, '{"error":"Sauvegarde invalide"}'); }
      });
      return;
    }
    if (url.pathname.startsWith('/api/library/') && request.method === 'DELETE') {
      store.remove(decodeURIComponent(url.pathname.slice('/api/library/'.length)));
      send(response, 200, '{"ok":true}');
      return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      send(response, 404, 'Introuvable', 'text/plain; charset=utf-8');
      return;
    }
    send(response, 200, fs.readFileSync(file), mimeTypes[path.extname(file)] || 'application/octet-stream');
  });
}

function startServer() {
  const root = app.getAppPath();
  const dataFolder = path.join(app.getPath('userData'), 'data');
  const dataFile = path.join(dataFolder, 'tangram-library.json');
  const seedFile = path.join(root, 'assets', 'default-library.json');
  if (!fs.existsSync(dataFile) && fs.existsSync(seedFile)) {
    fs.mkdirSync(dataFolder, { recursive: true });
    fs.copyFileSync(seedFile, dataFile);
  }
  server = createServer(root, new LibraryStore(dataFile));
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function createWindow() {
  const port = await startServer();
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1000, minHeight: 700, show: false,
    title: 'Tangram Atelier', icon: path.join(app.getAppPath(), 'assets', 'icon.png'), backgroundColor: '#f4f8f7',
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(`http://127.0.0.1:${port}/`)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  autoUpdater.on('update-downloaded', async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info', buttons: ['Installer maintenant', 'Plus tard'], defaultId: 0, cancelId: 1,
      title: 'Mise à jour prête', message: 'Une nouvelle version de Tangram Atelier est prête.',
      detail: 'Vos tangrams et silhouettes seront conservés.',
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => { await createWindow(); checkForUpdates(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => server?.close());
}

module.exports = { createServer };
