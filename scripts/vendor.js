// Copies the parts of three.js the game uses into src/renderer/vendor so the packaged game works fully offline.
const fs = require('fs');
const path = require('path');
const three = path.join(__dirname, '..', 'node_modules', 'three');
if (!fs.existsSync(path.join(three, 'build'))) throw new Error('three is not installed — run npm install');
const out = path.join(__dirname, '..', 'src', 'renderer', 'vendor');
const files = [
  ['build/three.module.js', 'three.module.js'],
  ['build/three.core.js', 'three.core.js'], // only exists in newer three.js builds
  ['examples/jsm/controls/OrbitControls.js', 'addons/controls/OrbitControls.js'],
  ['examples/jsm/geometries/RoundedBoxGeometry.js', 'addons/geometries/RoundedBoxGeometry.js'],
];
fs.rmSync(out, { recursive: true, force: true });
for (const [from, to] of files) {
  const src = path.join(three, from);
  if (!fs.existsSync(src)) { if (from.endsWith('three.core.js')) continue; throw new Error(`missing ${from}`); }
  fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
  fs.copyFileSync(src, path.join(out, to));
  console.log('vendor', to);
}
