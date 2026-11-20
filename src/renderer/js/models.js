// Shared 3D helpers and every character model (people, dogs, cats, bunnies, ponies, cars), built from code.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
export function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...opts }));
  return matCache.get(key);
}
const geoCache = new Map();
const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
export const rbox = (w, h, d, r = 0.08) => cached(`r${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.max(0.001, Math.min(r, Math.min(w, h, d) / 2 - 0.003))));
export const box = (w, h, d) => cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
export const sphere = (r, seg = 14) => cached(`s${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.75))));
export const cyl = (rt, rb, h, seg = 14) => cached(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const cone = (r, h, seg = 10) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
export const ico = (r, d = 0) => cached(`i${r}|${d}`, () => new THREE.IcosahedronGeometry(r, d));
export function mesh(geo, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color, opts) : color);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

// Soft round "contact shadow" under characters — makes them sit on the ground.
let blobTex = null;
export function blob(size = 1, opacity = 0.32) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(cached('blobplane', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.scale.set(size, size, 1); m.position.y = 0.02; m.renderOrder = 1;
  return m;
}

export function textCanvas(text, { size = 64, color = '#fff', bg = null, pad = 18, font = '900', stroke = null, radius = 22 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const f = `${font} ${size}px "Segoe UI", system-ui, sans-serif`;
  g.font = f;
  const w = Math.ceil(g.measureText(text).width) + pad * 2, h = Math.ceil(size * 1.35) + pad;
  c.width = w; c.height = h; g.font = f;
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = size / 6; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 2); }
  g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2);
  return c;
}
export function textSprite(text, height, opts) {
  const c = textCanvas(text, opts), t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(height * c.width / c.height, height, 1);
  return s;
}
export function signBoard(text, w, h, bg, color = '#fff') {
  const c = textCanvas(text, { size: 80, color, bg, pad: 30, radius: 30 });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const g = new THREE.Group();
  g.add(mesh(rbox(w + 0.3, h + 0.3, 0.25, 0.12), '#ffffff', 0, 0, -0.08));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  face.position.z = 0.06; g.add(face);
  return g;
}
export function tileTexture(a, b, n = 8) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), s = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s); }
  g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------------------------------- people
const SKIN = ['#f5d0b5', '#e8b896', '#c98e68', '#8d5a3b', '#f1c7a8', '#6b4430'];
const HAIR = ['#2b1d16', '#5a3a22', '#c99a57', '#1a1a1a', '#a0522d', '#e8d3a2', '#d9534f'];
const SHIRT = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#20c997', '#f783ac', '#ffffff', '#748ffc'];
const PANTS = ['#364fc7', '#495057', '#5c3d2e', '#2b2b2b', '#1c7ed6', '#868e96'];

export function makePerson({ shirt = pick(SHIRT), pants = pick(PANTS), skin = pick(SKIN), hair = pick(HAIR), hat = null, scale = rand(0.94, 1.06), long = Math.random() < 0.4 } = {}) {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body); body.scale.setScalar(scale);
  const legL = new THREE.Group(), legR = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  legL.position.set(-0.14, 0.72, 0); legR.position.set(0.14, 0.72, 0);
  for (const l of [legL, legR]) l.add(mesh(rbox(0.22, 0.72, 0.24, 0.07), pants, 0, -0.36, 0), mesh(rbox(0.25, 0.13, 0.36, 0.05), '#3b3b3b', 0, -0.7, 0.05));
  armL.position.set(-0.41, 1.42, 0); armR.position.set(0.41, 1.42, 0);
  for (const a of [armL, armR]) a.add(mesh(rbox(0.17, 0.62, 0.18, 0.07), shirt, 0, -0.27, 0), mesh(sphere(0.1, 8), skin, 0, -0.6, 0));
  const torso = mesh(rbox(0.68, 0.8, 0.4, 0.16), shirt, 0, 1.1, 0);
  const head = new THREE.Group(); head.position.set(0, 1.79, 0);
  head.add(mesh(sphere(0.31, 18), skin, 0, 0, 0));
  const hairM = mesh(new THREE.SphereGeometry(0.325, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.02, -0.02); hairM.rotation.x = -0.25; head.add(hairM);
  if (long) head.add(mesh(rbox(0.5, 0.42, 0.18, 0.08), hair, 0, -0.22, -0.2));
  head.add(mesh(sphere(0.048, 8), '#1b1b1b', -0.105, 0.03, 0.28), mesh(sphere(0.048, 8), '#1b1b1b', 0.105, 0.03, 0.28));
  head.add(mesh(sphere(0.05, 8), '#ff9aa2', -0.18, -0.07, 0.24, { transparent: true, opacity: 0.6 }), mesh(sphere(0.05, 8), '#ff9aa2', 0.18, -0.07, 0.24, { transparent: true, opacity: 0.6 }));
  head.add(mesh(rbox(0.12, 0.03, 0.03, 0.01), '#b5524a', 0, -0.11, 0.29));
  if (hat) head.add(mesh(cyl(0.33, 0.33, 0.13, 16), hat, 0, 0.23, 0), mesh(rbox(0.38, 0.05, 0.26, 0.02), hat, 0, 0.17, 0.29));
  body.add(legL, legR, armL, armR, torso, head);
  g.add(blob(0.95));
  g.userData = { legL, legR, armL, armR, head, torso, phase: rand(0, 6) };
  return g;
}
export function animatePerson(g, t, moving, working = false) {
  const u = g.userData, s = moving ? Math.sin(t * 9 + u.phase) : 0;
  u.legL.rotation.x = s * 0.6; u.legR.rotation.x = -s * 0.6;
  u.armL.rotation.x = -s * 0.5; u.armR.rotation.x = s * 0.5;
  if (working) { u.armR.rotation.x = -1.1 + Math.sin(t * 7 + u.phase) * 0.35; u.armL.rotation.x = -0.9 + Math.cos(t * 7 + u.phase) * 0.3; }
  u.torso.position.y = 1.1 + (moving ? Math.abs(Math.cos(t * 9 + u.phase)) * 0.06 : Math.sin(t * 2 + u.phase) * 0.012);
  u.head.position.y = u.torso.position.y + 0.69;
  u.head.rotation.y = moving ? 0 : Math.sin(t * 0.7 + u.phase) * 0.25;
}

// ---------------------------------------------------------------------------------------------------- animals
const DOG_COATS = [['#d9a35b', '#b07a3a'], ['#8b5a2b', '#5e3a1a'], ['#f4efe6', '#d8cfc0'], ['#3a3a3a', '#222'], ['#e7c48d', '#c79a5a'], ['#b9b9b9', '#8c8c8c'], ['#c46a2b', '#8e4a1d']];
const CAT_COATS = [['#f08c3c', '#c96a20'], ['#5c5c66', '#3c3c44'], ['#f4efe6', '#d0c4b0'], ['#2d2d33', '#1a1a1e'], ['#d9b38c', '#a8805c'], ['#9e9e9e', '#6e6e6e']];
const BUNNY_COATS = [['#ffffff', '#f2c4ce'], ['#c9a27e', '#f2c4ce'], ['#7d6e63', '#e8b4c0'], ['#e8e2d6', '#f2c4ce'], ['#3d3d3d', '#d99aa8']];
const PONY_COATS = [['#8b5a2b', '#3d2410'], ['#f0e6d6', '#c9b18a'], ['#3a2a20', '#1a120c'], ['#c9a46a', '#f5efe1'], ['#9b9b9b', '#ffffff']];

function legRig(g, coat, legs, spots, height, w, d) {
  for (const [x, z] of spots) {
    const l = new THREE.Group(); l.position.set(x, height, z);
    l.add(mesh(rbox(w, height + 0.02, w, Math.min(0.05, w / 2.5)), coat, 0, -height / 2, 0)); g.add(l); legs.push(l);
  }
}
export function makeAnimal(kind = 'dog', size = 1) {
  const g = new THREE.Group(); const b = new THREE.Group(); g.add(b); b.scale.setScalar(size);
  const legs = []; let head, tail, torso, ears = [];
  if (kind === 'dog') {
    const [c, e] = pick(DOG_COATS);
    legRig(b, c, legs, [[-0.15, 0.27], [0.15, 0.27], [-0.15, -0.27], [0.15, -0.27]], 0.32, 0.13);
    torso = mesh(rbox(0.46, 0.36, 0.8, 0.16), c, 0, 0.47, 0); b.add(torso);
    if (Math.random() < 0.3) for (let i = 0; i < 3; i++) b.add(mesh(sphere(0.1, 8), e, rand(-0.2, 0.2), 0.62, rand(-0.3, 0.3)));
    head = new THREE.Group(); head.position.set(0, 0.72, 0.42);
    head.add(mesh(rbox(0.4, 0.36, 0.36, 0.14), c), mesh(rbox(0.24, 0.17, 0.22, 0.07), '#f3e7d6', 0, -0.06, 0.24), mesh(sphere(0.055, 8), '#1b1b1b', 0, -0.01, 0.35));
    head.add(mesh(sphere(0.045, 6), '#1b1b1b', -0.1, 0.07, 0.18), mesh(sphere(0.045, 6), '#1b1b1b', 0.1, 0.07, 0.18), mesh(rbox(0.08, 0.02, 0.1, 0.01), '#ff6b8b', 0, -0.15, 0.3));
    const eL = mesh(rbox(0.1, 0.24, 0.16, 0.05), e, -0.2, 0.08, -0.02), eR = mesh(rbox(0.1, 0.24, 0.16, 0.05), e, 0.2, 0.08, -0.02);
    eL.rotation.z = 0.35; eR.rotation.z = -0.35; head.add(eL, eR); ears = [eL, eR];
    tail = new THREE.Group(); tail.position.set(0, 0.6, -0.4); tail.add(mesh(rbox(0.08, 0.32, 0.08, 0.04), c, 0, 0.14, 0)); tail.rotation.x = -0.6;
  } else if (kind === 'cat') {
    const [c, e] = pick(CAT_COATS);
    legRig(b, c, legs, [[-0.12, 0.22], [0.12, 0.22], [-0.12, -0.22], [0.12, -0.22]], 0.26, 0.1);
    torso = mesh(rbox(0.36, 0.3, 0.66, 0.14), c, 0, 0.38, 0); b.add(torso);
    if (Math.random() < 0.5) for (let i = 0; i < 3; i++) b.add(mesh(rbox(0.38, 0.04, 0.08, 0.02), e, 0, 0.5, -0.18 + i * 0.16));
    head = new THREE.Group(); head.position.set(0, 0.6, 0.34);
    head.add(mesh(sphere(0.2, 14), c), mesh(sphere(0.09, 10), '#f6eadb', 0, -0.06, 0.15), mesh(sphere(0.03, 6), '#ff8fab', 0, -0.02, 0.2));
    head.add(mesh(sphere(0.04, 8), '#7cc04a', -0.08, 0.05, 0.16, { emissive: '#4a7a20', emissiveIntensity: 0.3 }), mesh(sphere(0.04, 8), '#7cc04a', 0.08, 0.05, 0.16, { emissive: '#4a7a20', emissiveIntensity: 0.3 }));
    const eL = mesh(cone(0.08, 0.17, 4), c, -0.11, 0.2, 0), eR = mesh(cone(0.08, 0.17, 4), c, 0.11, 0.2, 0);
    eL.rotation.z = 0.25; eR.rotation.z = -0.25; head.add(eL, eR); ears = [eL, eR];
    tail = new THREE.Group(); tail.position.set(0, 0.45, -0.33); tail.add(mesh(rbox(0.07, 0.5, 0.07, 0.03), c, 0, 0.24, 0)); tail.rotation.x = -0.25;
  } else if (kind === 'bunny') {
    const [c, inner] = pick(BUNNY_COATS);
    legRig(b, c, legs, [[-0.1, 0.14], [0.1, 0.14], [-0.12, -0.14], [0.12, -0.14]], 0.12, 0.11);
    torso = mesh(sphere(0.27, 14), c, 0, 0.3, -0.04); torso.scale.set(1, 0.9, 1.2); b.add(torso);
    head = new THREE.Group(); head.position.set(0, 0.48, 0.22);
    head.add(mesh(sphere(0.17, 14), c), mesh(sphere(0.03, 6), '#ff8fab', 0, -0.02, 0.16), mesh(sphere(0.035, 6), '#1b1b1b', -0.08, 0.04, 0.12), mesh(sphere(0.035, 6), '#1b1b1b', 0.08, 0.04, 0.12));
    for (const x of [-0.06, 0.06]) { const ear = new THREE.Group(); ear.position.set(x, 0.12, -0.02); ear.add(mesh(rbox(0.08, 0.34, 0.05, 0.03), c, 0, 0.17, 0), mesh(rbox(0.05, 0.26, 0.02, 0.01), inner, 0, 0.17, 0.02)); ear.rotation.z = x * 2; head.add(ear); ears.push(ear); }
    tail = new THREE.Group(); tail.position.set(0, 0.3, -0.36); tail.add(mesh(sphere(0.09, 8), '#ffffff'));
  } else { // pony
    const [c, mane] = pick(PONY_COATS);
    legRig(b, c, legs, [[-0.2, 0.42], [0.2, 0.42], [-0.2, -0.42], [0.2, -0.42]], 0.62, 0.16);
    for (const l of legs) l.add(mesh(rbox(0.19, 0.1, 0.2, 0.03), '#2b2b2b', 0, -0.6, 0));
    torso = mesh(rbox(0.56, 0.52, 1.25, 0.22), c, 0, 0.86, 0); b.add(torso);
    head = new THREE.Group(); head.position.set(0, 1.25, 0.66);
    const neck = mesh(rbox(0.3, 0.6, 0.3, 0.1), c, 0, -0.1, -0.12); neck.rotation.x = 0.5; head.add(neck);
    head.add(mesh(rbox(0.3, 0.32, 0.55, 0.12), c, 0, 0.18, 0.1), mesh(rbox(0.26, 0.2, 0.2, 0.08), '#d7c3a6', 0, 0.1, 0.38));
    head.add(mesh(sphere(0.045, 6), '#1b1b1b', -0.15, 0.27, 0.15), mesh(sphere(0.045, 6), '#1b1b1b', 0.15, 0.27, 0.15));
    head.add(mesh(rbox(0.1, 0.55, 0.12, 0.04), mane, 0, 0.22, -0.18));
    const eL = mesh(cone(0.06, 0.16, 4), c, -0.1, 0.4, 0), eR = mesh(cone(0.06, 0.16, 4), c, 0.1, 0.4, 0); head.add(eL, eR); ears = [eL, eR];
    tail = new THREE.Group(); tail.position.set(0, 0.95, -0.62); tail.add(mesh(rbox(0.12, 0.55, 0.12, 0.05), mane, 0, -0.25, 0)); tail.rotation.x = 0.4;
  }
  b.add(head, tail);
  g.add(blob(kind === 'pony' ? 1.6 : kind === 'bunny' ? 0.6 : 0.9 * (kind === 'cat' ? 0.8 : 1)));
  g.userData = { kind, legs, head, tail, torso, ears, phase: rand(0, 6), baseY: torso.position.y };
  return g;
}
export function animateAnimal(g, t, moving) {
  const u = g.userData, ph = u.phase;
  if (u.kind === 'bunny') {
    const hop = moving ? Math.abs(Math.sin(t * 9 + ph)) : 0;
    g.children[0].position.y = hop * 0.18;
    u.ears.forEach((e, i) => { e.rotation.x = Math.sin(t * 3 + ph + i) * 0.15 - hop * 0.3; });
    u.head.rotation.x = moving ? 0 : Math.sin(t * 6 + ph) * 0.05;
    return;
  }
  const speed = u.kind === 'pony' ? 9 : 14, s = moving ? Math.sin(t * speed + ph) : 0;
  u.legs[0].rotation.x = s * 0.7; u.legs[3].rotation.x = s * 0.7; u.legs[1].rotation.x = -s * 0.7; u.legs[2].rotation.x = -s * 0.7;
  if (u.kind === 'dog') u.tail.rotation.z = Math.sin(t * (moving ? 16 : 10) + ph) * 0.6;
  else if (u.kind === 'cat') u.tail.rotation.z = Math.sin(t * 1.6 + ph) * 0.35;
  else u.tail.rotation.z = Math.sin(t * 2 + ph) * 0.2;
  u.head.rotation.x = moving ? 0 : Math.sin(t * 1.5 + ph) * 0.1 + (u.kind === 'pony' ? Math.max(0, Math.sin(t * 0.4 + ph)) * 0.5 : 0);
  u.torso.position.y = u.baseY + (moving ? Math.abs(Math.cos(t * speed + ph)) * 0.04 : 0);
}

// ---------------------------------------------------------------------------------------------------- cars
const CAR_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#f8f9fa', '#343a40', '#20c997', '#e64980', '#5c7cfa'];
export function makeCar(color = pick(CAR_COLORS), gold = false) {
  const g = new THREE.Group();
  const paint = gold ? { metalness: 0.7, roughness: 0.22, emissive: '#7a5600', emissiveIntensity: 0.3 } : { roughness: 0.35, metalness: 0.1 };
  const style = Math.random();
  g.add(mesh(rbox(1.85, 0.62, 3.7, 0.2), color, 0, 0.62, 0, paint));
  if (style < 0.3) { // van
    g.add(mesh(rbox(1.75, 0.95, 2.7, 0.2), color, 0, 1.3, -0.4, paint), mesh(rbox(1.78, 0.4, 0.9, 0.1), '#2a3a4a', 0, 1.35, 0.9, { roughness: 0.15, metalness: 0.4 }));
  } else {
    g.add(mesh(rbox(1.62, 0.6, 2.0, 0.22), color, 0, 1.18, -0.25, paint), mesh(rbox(1.66, 0.42, 1.6, 0.12), '#2a3a4a', 0, 1.2, -0.25, { roughness: 0.12, metalness: 0.5 }));
  }
  const wheels = [];
  for (const [x, z] of [[-0.88, 1.2], [0.88, 1.2], [-0.88, -1.2], [0.88, -1.2]]) {
    const w = new THREE.Group(); w.position.set(x, 0.36, z);
    const tire = mesh(cyl(0.36, 0.36, 0.28, 18), '#1f1f1f'); tire.rotation.z = Math.PI / 2; w.add(tire);
    const hub = mesh(cyl(0.18, 0.18, 0.3, 10), '#cfd4da', 0, 0, 0, { metalness: 0.6, roughness: 0.3 }); hub.rotation.z = Math.PI / 2; w.add(hub);
    g.add(w); wheels.push(w);
  }
  const light = { emissive: '#fff3a0', emissiveIntensity: 0.5 };
  g.add(mesh(rbox(0.42, 0.16, 0.06, 0.03), '#fff8d6', -0.55, 0.7, 1.86, light), mesh(rbox(0.42, 0.16, 0.06, 0.03), '#fff8d6', 0.55, 0.7, 1.86, light));
  g.add(mesh(rbox(0.4, 0.14, 0.06, 0.03), '#ff4d4d', -0.55, 0.72, -1.86), mesh(rbox(0.4, 0.14, 0.06, 0.03), '#ff4d4d', 0.55, 0.72, -1.86));
  g.add(blob(3.4, 0.28)); g.children.at(-1).scale.set(2.2, 4.2, 1);
  g.userData = { wheels };
  return g;
}

// ---------------------------------------------------------------------------------------------------- scenery
export function tree(x, z, s = 1, palette = ['#4fae4a', '#5cbf55', '#3e9e45', '#6ccb5f']) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  g.add(mesh(cyl(0.22, 0.3, 1.6, 8), '#8a5a35', 0, 0.8, 0));
  const leaf = pick(palette), crown = new THREE.Group(); crown.position.y = 2.4;
  crown.add(mesh(ico(1.35, 0), leaf), mesh(ico(1, 0), leaf, 0.5, 0.8, 0.2), mesh(ico(0.8, 0), leaf, -0.6, 0.4, -0.3));
  g.add(crown, blob(3.2, 0.25));
  g.rotation.y = rand(0, 6); g.userData = { crown, phase: rand(0, 6) };
  return g;
}
export function cloud() {
  const g = new THREE.Group();
  const m = mat('#ffffff', { roughness: 1, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(ico(rand(1.4, 2.6), 1), m); s.position.set(i * 1.8 - 3.6, rand(-0.3, 0.6), rand(-0.8, 0.8)); g.add(s); }
  return g;
}
