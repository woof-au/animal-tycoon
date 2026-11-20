// Animal Tycoon — Electron main process.
// Owns the window, Woof Services sign-in (device link), cloud-save calls and background auto-updates.
// The game page never talks to the network itself; everything goes through the small API in preload.js.
const { app, BrowserWindow, ipcMain, shell, clipboard, safeStorage, protocol, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');

const SITE = 'https://woof-services.stream';
const RENDERER = path.join(__dirname, 'renderer');
const APP_ID = 'tycoon';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

app.setAppUserModelId('stream.woof-services.animaltycoon');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); }

// ------------------------------------------------------------------ small local store (userData)
const dataDir = () => app.getPath('userData');
const readJson = (name, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir(), name), 'utf8')); } catch { return fallback; } };
const writeJson = (name, v) => { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(path.join(dataDir(), name), JSON.stringify(v)); };

function deviceId() {
  const s = readJson('device.json', {});
  if (s.id && /^[0-9a-f-]{36}$/.test(s.id)) return s.id;
  const id = crypto.randomUUID(); writeJson('device.json', { id }); return id;
}
// The sign-in token is encrypted with Windows DPAPI (safeStorage), so only this Windows user can read it.
function loadAuth() {
  try {
    const raw = fs.readFileSync(path.join(dataDir(), 'auth.bin'));
    const v = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8'));
    return v && v.token ? v : null;
  } catch { return null; }
}
function saveAuth(v) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const text = JSON.stringify(v);
  fs.writeFileSync(path.join(dataDir(), 'auth.bin'), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text));
}
function clearAuth() { try { fs.unlinkSync(path.join(dataDir(), 'auth.bin')); } catch { /* not signed in */ } }

// ------------------------------------------------------------------ Woof Services API (Node fetch: no Origin header)
async function api(pathname, body, timeoutMs = 15000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(SITE + pathname, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': `AnimalTycoon/${app.getVersion()} (${process.platform === 'darwin' ? 'macOS' : 'Windows'})` }, body: JSON.stringify(body), signal: ctrl.signal });
    const d = await r.json().catch(() => ({}));
    return { status: r.status, ...d };
  } finally { clearTimeout(t); }
}
const base = () => ({ deviceId: deviceId(), platform: process.platform, appVersion: app.getVersion() });
const authed = () => { const a = loadAuth(); return a ? { ...base(), token: a.token } : null; };

let link = null; // { pollToken, cancelled }
ipcMain.handle('info', () => ({ version: app.getVersion(), platform: process.platform === 'darwin' ? 'mac' : 'windows', dev: !app.isPackaged }));
ipcMain.handle('auth:status', () => { const a = loadAuth(); return { signedIn: !!a, name: a?.name || null }; });
ipcMain.handle('auth:start', async () => {
  const r = await api('/api/app/link/start', { ...base(), app: APP_ID });
  if (!r.ok) throw new Error(r.error || 'Could not reach Woof Services. Check your internet and try again.');
  link = { pollToken: r.pollToken, cancelled: false, interval: Math.max(2, Number(r.interval) || 3) };
  shell.openExternal(r.url);
  return { code: r.code, url: r.url };
});
ipcMain.handle('auth:wait', async () => {
  const me = link; if (!me) return { status: 'expired' };
  const deadline = Date.now() + 10 * 60_000;
  while (!me.cancelled && Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, me.interval * 1000));
    if (me.cancelled) break;
    let r; try { r = await api('/api/app/link/poll', { pollToken: me.pollToken }); } catch { continue; }
    if (r.status === 'approved' && r.token) { saveAuth({ token: r.token, name: r.name || null }); link = null; win?.focus(); return { status: 'approved', name: r.name || null }; }
    if (r.status === 'denied' || r.status === 'expired') { link = null; return { status: r.status, error: r.error }; }
  }
  return { status: me.cancelled ? 'cancelled' : 'expired' };
});
ipcMain.handle('auth:cancel', () => { if (link) link.cancelled = true; link = null; });
ipcMain.handle('auth:signOut', async () => {
  const a = authed();
  if (a) api('/api/app/logout', a, 5000).catch(() => {});
  clearAuth();
});
const signedOut = (r) => r.status === 401 || r.signedOut;
ipcMain.handle('cloud:session', async () => {
  const a = authed(); if (!a) return { ok: false, signedOut: true };
  const r = await api('/api/app/tycoon/session', a);
  if (signedOut(r)) { clearAuth(); return { ok: false, signedOut: true }; }
  return r;
});
ipcMain.handle('cloud:sync', async (_e, { data, baseRevision, minutes }) => {
  const a = authed(); if (!a) return { ok: false, signedOut: true };
  return api('/api/app/tycoon/sync', { ...a, data: data ?? null, baseRevision, minutes });
});
ipcMain.handle('cloud:claim', async (_e, ids) => { const a = authed(); if (!a) return { ok: false }; return api('/api/app/tycoon/claim', { ...a, ids }); });
ipcMain.handle('open', (_e, url) => { if (typeof url === 'string' && /^https:\/\/(woof-services\.stream|github\.com\/woof-au)\//.test(url)) shell.openExternal(url); });
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text).slice(0, 500)); return true; });

// Counts this PC once per installed version (no account needed) so the site can show installs.
function pingInstall() {
  const s = readJson('state.json', {});
  if (s.pinged === app.getVersion()) return;
  api('/api/app/tycoon/install', base()).then((r) => { if (r.ok) writeJson('state.json', { ...s, pinged: app.getVersion() }); }).catch(() => {});
}

// ------------------------------------------------------------------ auto-updates (GitHub releases of woof-au/animal-tycoon)
let updateState = null;
const IS_MAC = process.platform === 'darwin';
const macUpdater = IS_MAC ? require('./mac-updater') : null;
function setupUpdates() {
  if (!app.isPackaged) return;
  const send = (u) => { updateState = u; win?.webContents.send('update', u); };
  let check;
  if (IS_MAC) check = () => macUpdater.check(send);
  else {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true; // a downloaded update installs when the game closes, so the next start is new
    autoUpdater.on('update-available', (i) => send({ state: 'downloading', version: i.version }));
    autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
    autoUpdater.on('error', () => { /* offline or GitHub unavailable: try again later */ });
    check = () => autoUpdater.checkForUpdates().catch(() => {});
  }
  setTimeout(check, 8000);
  setInterval(check, 30 * 60_000);
}
ipcMain.on('update:restart', () => {
  quitting = true;
  if (IS_MAC) { macUpdater.swapAfterQuit(true); app.quit(); } else autoUpdater.quitAndInstall(true, true);
});
// Mac: a downloaded update is swapped in when the game quits, so the next start is the new version.
app.on('will-quit', () => { if (IS_MAC && macUpdater.hasStaged()) macUpdater.swapAfterQuit(false); });

// ------------------------------------------------------------------ window
let win = null, quitting = false;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 860, minWidth: 1024, minHeight: 640, show: false, backgroundColor: '#8fd3ff', title: 'Animal Tycoon',
    icon: path.join(__dirname, '..', 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: true },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  win.webContents.on('did-finish-load', () => { if (updateState) win.webContents.send('update', updateState); });
  // Give the game a moment to upload the save before closing.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); quitting = true;
    const done = () => { win?.destroy(); app.quit(); };
    const t = setTimeout(done, 5000);
    ipcMain.once('quit:ready', () => { clearTimeout(t); done(); });
    win.webContents.send('quit');
  });
  win.loadURL('app://game/index.html');
  // Developer smoke test: TYCOON_SMOKE=<png path> loads the game, saves a screenshot, prints page errors and exits.
  if (process.env.TYCOON_SMOKE) {
    win.webContents.on('console-message', (_e, level, message) => console.log(`[page:${level}] ${message}`));
    win.webContents.on('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.TYCOON_SMOKE, img.toPNG());
      console.log('state', JSON.stringify(await win.webContents.executeJavaScript(`({ login: document.getElementById('login').className, loading: document.getElementById('loading').className, bridge: !!window.woof, text: document.getElementById('loadtext').textContent })`)));
      app.exit(0);
    }, 9000));
  }
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  // Windows: no menu bar. Mac: the standard app menu (Quit, Hide…) and Edit menu (copy/paste the invite link).
  Menu.setApplicationMenu(IS_MAC ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(RENDERER, rel || 'index.html'));
    if (!file.startsWith(RENDERER + path.sep)) return new Response('Not found', { status: 404 });
    try {
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  createWindow();
  setupUpdates();
  pingInstall();
});
app.on('window-all-closed', () => app.quit());
