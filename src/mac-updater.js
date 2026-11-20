// macOS updates. electron-updater only installs apps signed with a paid Apple certificate, so on the Mac the game
// updates itself the same way Woof Tweaks does: download the universal .zip named in latest-mac.yml, check its
// sha512, unpack it next to the app, and swap the app bundles after the game quits.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const RELEASES = 'https://github.com/woof-au/animal-tycoon/releases';
let staged = null; // { app, work, version }
let busy = false;

const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 300_000 }, (e, out) => (e ? reject(e) : resolve(String(out)))));
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

function parseLatestYml(text) {
  const version = (text.match(/^version:\s*['"]?([0-9.]+)['"]?\s*$/m) || [])[1];
  const files = [...text.matchAll(/-\s*url:\s*(\S+)\s*\n\s*sha512:\s*(\S+)\s*\n\s*size:\s*(\d+)/g)].map((m) => ({ url: m[1], sha512: m[2], size: Number(m[3]) }));
  const zip = files.find((f) => f.url.endsWith('.zip'));
  return version && zip ? { version, ...zip } : null;
}

function bundle() {
  const b = path.resolve(app.getPath('exe'), '..', '..', '..');
  return b.endsWith('.app') ? b : null;
}
/** Can the running app replace itself? Not while it runs from the Downloads quarantine or a read-only folder. */
function canSelfUpdate() {
  const b = bundle();
  if (!b || b.includes('/AppTranslocation/') || b.startsWith('/Volumes/')) return false;
  try { fs.accessSync(path.dirname(b), fs.constants.W_OK); fs.accessSync(b, fs.constants.W_OK); return true; } catch { return false; }
}

async function download(url, dest, size, sha512) {
  const r = await fetch(url, { headers: { 'User-Agent': `AnimalTycoon/${app.getVersion()} (macOS)` }, redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  const hash = crypto.createHash('sha512'), out = fs.createWriteStream(dest);
  let got = 0;
  for await (const chunk of r.body) {
    got += chunk.length;
    if (got > size) throw new Error('Download too large');
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
  }
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  if (got !== size || hash.digest('base64') !== sha512) throw new Error('The download did not match its checksum');
}

/** Check for a newer version; download and stage it. send() tells the game window what is happening. */
async function check(send) {
  if (busy || staged) return;
  busy = true;
  let work = null;
  try {
    const r = await fetch(`${RELEASES}/latest/download/latest-mac.yml`, { headers: { 'User-Agent': `AnimalTycoon/${app.getVersion()} (macOS)` } });
    if (!r.ok) return;
    const info = parseLatestYml(await r.text());
    if (!info || cmp(info.version, app.getVersion()) <= 0) return;
    if (!canSelfUpdate()) {
      send({ state: 'manual', version: info.version, url: 'https://woof-services.stream/animal-tycoon', message: `✨ Animal Tycoon ${info.version} is available. Move the game to Applications to update automatically.` });
      return;
    }
    if (!/^[\w.-]+\.zip$/.test(info.url) || info.size <= 0 || info.size > 800 * 1048576) return;
    send({ state: 'downloading', version: info.version });
    const b = bundle();
    work = path.join(path.dirname(b), '.animal-tycoon-update');
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work);
    const zip = path.join(work, 'update.zip');
    await download(`${RELEASES}/download/v${info.version}/${info.url}`, zip, info.size, info.sha512);
    const dest = path.join(work, 'new');
    await run('/usr/bin/ditto', ['-x', '-k', zip, dest]);
    fs.rmSync(zip, { force: true });
    const name = fs.readdirSync(dest).find((f) => f.endsWith('.app'));
    if (!name) throw new Error('The update was incomplete');
    const newApp = path.join(dest, name);
    const v = (await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(newApp, 'Contents', 'Info.plist')])).trim();
    if (v !== info.version) throw new Error('The update has the wrong version');
    await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newApp]).catch(() => {});
    staged = { app: newApp, work, version: info.version };
    send({ state: 'ready', version: info.version });
  } catch {
    if (work) fs.rmSync(work, { recursive: true, force: true });
  } finally { busy = false; }
}

const hasStaged = () => !!staged;

/** After the game has quit: swap the old app for the new one (and open it again when relaunch is true). */
function swapAfterQuit(relaunch) {
  if (!staged) return;
  const script = [
    'pid="$1"; old="$2"; new="$3"; work="$4"',
    'for i in $(seq 1 600); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done',
    'mv "$old" "$work/old.app" && mv "$new" "$old" || { [ -d "$work/old.app" ] && [ ! -d "$old" ] && mv "$work/old.app" "$old"; }',
    relaunch ? 'open "$old"' : ':',
    'sleep 5; rm -rf "$work"',
  ].join('\n');
  spawn('/bin/sh', ['-c', script, 'animal-tycoon-update', String(process.pid), bundle(), staged.app, staged.work], { detached: true, stdio: 'ignore' }).unref();
  staged = null;
}

module.exports = { check, hasStaged, swapAfterQuit, parseLatestYml };
