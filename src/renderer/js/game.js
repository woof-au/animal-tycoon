// Animal Tycoon — the game. Scene, simulation, interface, tutorial, cloud saves and the start-up flow.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { V, rand, pick, lerpAngle, mesh, mat, rbox, box, cyl, textSprite, makePerson, animatePerson, makeAnimal, animateAnimal, makeCar } from './models.js';
import { buildWorld, LAYOUT as L } from './world.js';
import { WORLDS, economy, ORDER, newWorldState, inviteBonus } from './worlds.js';
import { audio, sfx } from './music.js';
import { bridge, isDev } from './bridge.js';

const $ = (id) => document.getElementById(id);
// Phones and tablets (Android): touch controls, a compact layout and lighter graphics by default.
const TOUCH = matchMedia('(pointer: coarse)').matches || !!window.WoofNative;
if (TOUCH) document.body.classList.add('touch');
const CONTROLS_TEXT = TOUCH
  ? 'Drag to move around · pinch to zoom · twist with two fingers to turn · tap a building to upgrade it'
  : 'WASD / arrows to move · Q / E to turn · scroll to zoom · click a building to upgrade it';
const fmt = (n) => {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.floor(n).toLocaleString()}`;
};
const TIPS = ['Tip: the adoption desk is usually the bottleneck — hire clerks early!', 'Tip: click the golden VIP car for a big cash bonus.', 'Tip: invite friends from the 🎁 button — you both get a huge bonus.', 'Tip: the Manager multiplies every sale in the world.', 'Tip: use WASD or the arrow keys to look around.', 'Tip: max every upgrade in a world to unlock the next one.'];

// =====================================================================================================
//  Renderer, camera, lights
// =====================================================================================================
const canvas = $('scene');
// Low resource use: the normal (not "high-performance") GPU so laptops stay on their power-saving graphics, no
// multisampling on phones, and shadows only for the scenery, drawn once and refreshed when something changes.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOUCH, powerPreference: 'default', stencil: false });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const refreshShadows = () => { renderer.shadowMap.needsUpdate = true; };
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 500);
camera.position.set(34, 42, 46);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-4, 0, -2);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.18; controls.minPolarAngle = 0.42;
controls.minDistance = 18; controls.maxDistance = 115;
controls.screenSpacePanning = false;
// Tall phone screens: start further back so the whole shelter fits.
if (innerWidth / innerHeight < 1) camera.position.sub(controls.target).multiplyScalar(1.75).add(controls.target);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
// Touch: one finger slides the view across the ground (like most tycoon games), two fingers pinch-zoom and turn.
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
if (TOUCH) { controls.panSpeed = 1.4; controls.rotateSpeed = 0.8; }

const hemi = new THREE.HemisphereLight('#d6eeff', '#9ccf74', 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 2.5);
sun.position.set(30, 50, 22); sun.castShadow = true;
const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 150;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun);

// Sky: a soft vertical gradient dome
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#6fc3ff') }, bottom: { value: new THREE.Color('#d9f1ff') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.6 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat));

// High: sharp on high-DPI screens (capped at 1.5×), 60 fps. Fast: native 1×, 30 fps, smaller shadow map, no tree sway.
let quality = 'high', frameMs = 1000 / 60;
function applyQuality(q) {
  quality = q === 'low' ? 'low' : 'high';
  renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 1.5) : 1);
  const size = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(size, size);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  frameMs = 1000 / (quality === 'high' ? 60 : 30);
  refreshShadows();
}

// =====================================================================================================
//  Game state (saved to the cloud)
// =====================================================================================================
let save = null, W = null, CFG = null, ws = null, world = null, revision = 0, dirty = false, signedName = '';
const runtime = { time: 0, log: [], playSec: 0, unsyncedMin: 0, panelKey: null, tutorial: null };
function defaultSave() {
  const w = WORLDS[0];
  return { v: 1, current: 1, worlds: { 1: newWorldState(w, economy(w, fmt)) }, tutorialDone: false, settings: { music: 0.5, sfx: 0.7, quality: TOUCH ? 'low' : 'high' }, playSec: 0, created: Date.now() };
}
/** Makes any cloud save safe to load: fills missing parts and keeps worlds in order (a world needs the one before it done). */
function normalizeSave(s) {
  const d = defaultSave();
  if (!s || typeof s !== 'object' || !s.v) return d;
  s.worlds = s.worlds && typeof s.worlds === 'object' ? s.worlds : {};
  s.settings = { ...d.settings, ...(s.settings && typeof s.settings === 'object' ? s.settings : {}) };
  const ok = (n) => Number.isInteger(n) && n >= 1 && n <= WORLDS.length;
  if (!ok(s.current)) s.current = 1;
  while (s.current > 1 && !s.worlds[s.current - 1]?.done) s.current--;
  if (!ok(s.viewing) || s.viewing > s.current) s.viewing = s.current;
  if (!Number.isFinite(s.playSec)) s.playSec = 0;
  return s;
}
const val = (k, t) => CFG[k].tracks[t].val(ws.lv[k][t]);
const score = (s) => Object.values(s?.worlds || {}).reduce((a, w) => a + (w.earned || 0), 0) + (s?.current || 0) * 1e15;
function markDirty() { dirty = true; }

function earn(amount, pos) {
  const v = Math.round(amount * val('office', 'boost'));
  ws.money += v; ws.earned += v; runtime.log.push([runtime.time, v]); markDirty();
  if (pos) floatText(`+${fmt(v)}`, pos.clone().add(V(0, 0, 0.6)).setY(pos.y || 2.4), '#21a35b');
  sfx.coin(); $('money').classList.remove('pop'); void $('money').offsetWidth; $('money').classList.add('pop');
}
function incomeRate() {
  while (runtime.log.length && runtime.log[0][0] < runtime.time - 30) runtime.log.shift();
  return runtime.log.reduce((s, [, a]) => s + a, 0) / Math.min(30, Math.max(5, runtime.time));
}

// =====================================================================================================
//  Effects
// =====================================================================================================
const fx = [];
function floatText(text, pos, color = '#2fbf71', size = 0.9, life = 1.4) {
  if (fx.length > 24) return; // each label is a small texture: cap how many exist at once
  const s = textSprite(text, size, { size: 64, color, stroke: '#ffffff' });
  s.position.copy(pos); scene.add(s); fx.push({ s, life, t: 0, vy: 1.4 });
}
function popIcon(text, obj, life = 1.6, size = 0.8) {
  const s = textSprite(text, size, { size: 64, bg: '#ffffffee', color: '#000', pad: 10, radius: 40 });
  scene.add(s); fx.push({ s, life, t: 0, follow: obj, dy: 2.7 });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.follow) f.s.position.set(f.follow.position.x, f.follow.position.y + f.dy + Math.sin(f.t * 6) * 0.05, f.follow.position.z);
    else f.s.position.y += f.vy * dt;
    f.s.material.opacity = Math.min(1, (f.life - f.t) / 0.4);
    if (f.t >= f.life) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); fx.splice(i, 1); }
  }
}
const bits = [];
function confetti(at) {
  for (let i = 0; i < 80; i++) {
    const m = mesh(box(0.18, 0.04, 0.12), pick(['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#b197fc', '#ff922b']), at.x, 2, at.z);
    m.castShadow = false; scene.add(m);
    bits.push({ m, v: V(rand(-4, 4), rand(-4, 4), rand(6, 11)), r: V(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: rand(1.6, 2.6) });
  }
}
function updateBits(dt) {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i]; b.life -= dt; b.v.y -= 14 * dt; b.m.position.addScaledVector(b.v, dt);
    b.m.rotation.x += b.r.x * dt; b.m.rotation.y += b.r.y * dt;
    if (b.m.position.y < 0.05) { b.m.position.y = 0.05; b.v.set(0, 0, 0); }
    if (b.life <= 0) { scene.remove(b.m); bits.splice(i, 1); }
  }
}

// =====================================================================================================
//  Movement
// =====================================================================================================
class Walker {
  constructor(obj, speed) { this.obj = obj; this.speed = speed; this.path = []; this.done = null; this.moving = false; this.face = null; }
  walk(points) { this.path = points.map((p) => p.clone()); this.moving = this.path.length > 0; return new Promise((res) => { this.done = res; if (!this.moving) res(); }); }
  update(dt) {
    if (!this.path.length) { this.moving = false; if (this.face) { const want = Math.atan2(this.face.x - this.obj.position.x, this.face.z - this.obj.position.z); this.obj.rotation.y = lerpAngle(this.obj.rotation.y, want, Math.min(1, dt * 8)); } return; }
    const p = this.obj.position, tgt = this.path[0], dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz), step = this.speed * dt;
    if (d <= step) { p.x = tgt.x; p.z = tgt.z; this.path.shift(); if (!this.path.length) { this.moving = false; const r = this.done; this.done = null; r?.(); } return; }
    p.x += dx / d * step; p.z += dz / d * step; this.moving = true;
    this.obj.rotation.y = lerpAngle(this.obj.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 12));
  }
}
const timers = [];
const sleep = (s) => new Promise((res) => timers.push({ t: s, res }));

// =====================================================================================================
//  Animals in pens and in the yard
// =====================================================================================================
let pens = [], yardAnimals = [], homeless = [];
const animalY = 0.23;
function makePens() {
  pens = [];
  const mk = (rect, key, th) => ({ rect, key, kind: th.animal, size: th.size, animals: [] });
  L.PEN_A.forEach((r) => pens.push(mk(r, 'penA', W.penA)));
  L.PEN_B.forEach((r) => pens.push(mk(r, 'penB', W.penB)));
  for (const p of pens) if (p.key === 'penA' || ws.unlocked.penB) { penAnimal(p); penAnimal(p); }
}
function penAnimal(p, pop = false) {
  const a = makeAnimal(p.kind, p.size * rand(0.9, 1.08)), [x0, z0, x1, z1] = p.rect;
  a.position.set(rand(x0 + 0.7, x1 - 0.7), animalY, rand(z0 + 0.8, z1 - 0.7)); a.rotation.y = rand(0, 6);
  if (pop) a.scale.setScalar(0.01);
  scene.add(a);
  const o = { obj: a, walker: new Walker(a, p.kind === 'pony' ? 1.1 : 1.4), pen: p, wait: rand(0, 3), grow: pop ? 0 : 1 };
  p.animals.push(o); return o;
}
function updatePens(dt, t) {
  for (const p of pens) for (const a of p.animals) {
    if (a.grow < 1) { a.grow = Math.min(1, a.grow + dt * 2.5); a.obj.scale.setScalar(Math.max(0.01, a.grow * 1.1 > 1 && a.grow < 1 ? 1.08 : a.grow)); }
    a.walker.update(dt);
    if (!a.walker.moving) { a.wait -= dt; if (a.wait <= 0) { const [x0, z0, x1, z1] = p.rect; a.walker.walk([V(rand(x0 + 0.7, x1 - 0.7), rand(z0 + 0.8, z1 - 0.7), animalY)]); a.wait = rand(1.5, 4.5); } }
    animateAnimal(a.obj, t, a.walker.moving);
  }
}
function makeYard() {
  yardAnimals = [];
  const { YARD } = L, n = W.yardAnimal === 'pony' ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const a = makeAnimal(W.yardAnimal, W.yardAnimal === 'pony' ? 1 : rand(0.8, 1.1)); a.position.set(rand(YARD.x0 + 1.5, YARD.x1 - 1.5), 0.08, rand(YARD.z0 + 1.5, YARD.z1 - 1.5)); scene.add(a);
    yardAnimals.push({ obj: a, walker: new Walker(a, W.yardAnimal === 'pony' ? rand(2.2, 3) : rand(3, 4.5)), wait: 0 });
  }
}
function updateYard(dt, t) {
  const { YARD } = L;
  for (const a of yardAnimals) {
    a.walker.update(dt);
    if (!a.walker.moving) { a.wait -= dt; if (a.wait <= 0) { a.walker.walk([V(rand(YARD.x0 + 1.5, YARD.x1 - 1.5), rand(YARD.z0 + 1.5, YARD.z1 - 1.5), 0.08)]); a.wait = rand(0.5, 3); } }
    animateAnimal(a.obj, t, a.walker.moving);
  }
}

// =====================================================================================================
//  Service stations
// =====================================================================================================
const STAFF_COLOR = () => ({ penA: W.penA.color, penB: W.penB.color, desk: W.desk.color, shop: W.shop.trim });
class Station {
  constructor(key, o) { Object.assign(this, { key, ...o }); this.waiting = []; this.serving = [null, null, null]; this.staff = []; }
  get servers() { return ws.unlocked[this.key] ? val(this.key, 'staff') : 0; }
  get time() { return this.base / val(this.key, 'speed'); }
  get patience() { return this.key === 'desk' ? val('desk', 'comfort') : this.key === 'shop' ? 30 : 0; }
  serve(v) { return new Promise((res, rej) => { this.waiting.push({ v, res, rej, wait: 0, qi: -1 }); }); }
  syncStaff() {
    while (this.staff.length < this.servers) {
      const k = this.staff.length, c = STAFF_COLOR()[this.key], p = makePerson({ shirt: c, hat: c, pants: '#2b2b2b' });
      p.position.copy(this.staffAt(k)); p.position.y = 0.2; p.rotation.y = this.staffFace ?? 0; scene.add(p); this.staff.push(p);
      if (runtime.time > 1) floatText('New staff!', p.position.clone().setY(2.6), '#ff7a45', 0.7);
    }
  }
  update(dt, t) {
    this.syncStaff();
    for (let k = 0; k < 3; k++) {
      const s = this.serving[k];
      if (!s && k < this.servers && this.waiting.length) {
        const e = this.waiting.shift(); e.t = 0; this.serving[k] = e;
        e.v.walk(this.approach ? [this.approach(e.v.obj.position, k), this.spots(k)] : [this.spots(k)]); e.v.walker.face = this.staffAt(k);
      } else if (s && !s.v.walker.moving) {
        s.t += dt; s.v.progress(s.t / this.time);
        if (s.t >= this.time) { this.serving[k] = null; s.v.progress(-1); s.v.walker.face = null; s.res(); }
      }
      if (this.staff[k]) animatePerson(this.staff[k], t, false, !!this.serving[k] && !this.serving[k].v.walker.moving);
    }
    for (let i = 0; i < this.waiting.length; i++) {
      const e = this.waiting[i];
      if (e.qi !== i) { e.qi = i; e.v.walk([this.queueAt(i)]); e.v.walker.face = null; }
      if (!e.v.walker.moving) e.wait += dt;
      const pat = this.patience;
      if (pat && e.wait > pat) { this.waiting.splice(i, 1); i--; e.rej(new Error('angry')); }
      else if (pat && e.wait > pat * 0.6 && !e.v.annoyed) { e.v.annoyed = true; popIcon('😤', e.v.obj, 1.4, 0.7); }
    }
  }
  reset() { for (const p of this.staff) scene.remove(p); this.staff = []; this.waiting = []; this.serving = [null, null, null]; }
}
// Inside the hall everyone passes west of the desk (HUB) so nobody walks through it.
const HUB = V(0.9, 0.4), DOOR_OUT = V(-7.4, -2.5), DOOR_IN = V(-4.7, -2.5), EXIT_Z = 3.95;
const SHOP_OUT = V(-18.7, -1.3), SHOP_IN = V(-18.7, 1.7);
const stations = {
  penA: new Station('penA', { spots: (k) => V([-3.9, -0.7, 2.5][k], -3.45), staffAt: (k) => V([-3.9, -0.7, 2.5][k], -4.75), queueAt: (i) => V(-4.2 + (i % 6) * 0.85, -1.9 + Math.floor(i / 6) * 0.85), base: 5.5 }),
  penB: new Station('penB', { spots: (k) => V([6.3, 9.9, 8.1][k], -3.45), staffAt: (k) => V([6.3, 9.9, 8.1][k], -4.75), queueAt: (i) => V(5.4 + (i % 6) * 0.85, -1.9 + Math.floor(i / 6) * 0.85), base: 6.5 }),
  desk: new Station('desk', { spots: (k) => V([3.6, 6.2, 8.8][k], 3.25), staffAt: (k) => V([3.6, 6.2, 8.8][k], 1.0), queueAt: (i) => V(1.3 - i * 0.85, 3.25), base: 4.5 }),
  shop: new Station('shop', { spots: (k) => V([-17.2, -15.6, -14][k], 10.95), staffAt: (k) => V([-17.2, -15.6, -14][k], 8.6), queueAt: (i) => V(-19.2 - i * 0.85, 10.95), base: 3.5 }),
};

// =====================================================================================================
//  Visitors and cars
// =====================================================================================================
const visitors = new Set();
class Visitor {
  constructor(at) {
    this.obj = makePerson(); this.obj.position.copy(at); this.obj.position.y = 0.2; scene.add(this.obj);
    this.walker = new Walker(this.obj, rand(2.7, 3.2)); this.pet = null; this.leash = null; this.bar = null; this.annoyed = false; visitors.add(this);
  }
  walk(points) { return this.walker.walk(points); }
  progress(f) {
    if (f < 0) { if (this.bar) { scene.remove(this.bar); this.bar = null; } return; }
    if (!this.bar) {
      this.bar = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.18), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }));
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: '#2fbf71', depthTest: false }));
      fg.position.z = 0.001; bg.renderOrder = 10; fg.renderOrder = 11; this.bar.add(bg, fg); this.bar.userData.fg = fg; scene.add(this.bar);
    }
    const fg = this.bar.userData.fg, p = Math.min(1, f); fg.scale.x = Math.max(0.001, p); fg.position.x = -(1 - p) / 2;
    this.bar.position.set(this.obj.position.x, 2.65, this.obj.position.z); this.bar.quaternion.copy(camera.quaternion);
  }
  update(dt, t) {
    this.walker.update(dt); animatePerson(this.obj, t, this.walker.moving);
    if (!this.pet) return;
    const d = this.pet, me = this.obj.position, ang = this.obj.rotation.y, back = d.obj.userData.kind === 'pony' ? 1.6 : 1;
    const want = V(me.x - Math.sin(ang) * back + Math.cos(ang) * 0.6, me.z - Math.cos(ang) * back - Math.sin(ang) * 0.6, d.obj.position.y);
    const dx = want.x - d.obj.position.x, dz = want.z - d.obj.position.z, dist = Math.hypot(dx, dz), moving = dist > 0.15;
    if (moving) { const sp = Math.min(dist, (dist > 3 ? 6 : 3.4) * dt); d.obj.position.x += dx / dist * sp; d.obj.position.z += dz / dist * sp; d.obj.rotation.y = lerpAngle(d.obj.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10)); }
    animateAnimal(d.obj, t, moving);
    const a = this.leash.geometry.attributes.position, s = d.obj.children[0].scale.x, h = d.obj.userData.kind === 'pony' ? 1.2 : 0.62;
    a.setXYZ(0, me.x + Math.cos(ang) * 0.4, 0.95, me.z - Math.sin(ang) * 0.4);
    a.setXYZ(1, d.obj.position.x + Math.sin(d.obj.rotation.y) * 0.4 * s, h * s + 0.12, d.obj.position.z + Math.cos(d.obj.rotation.y) * 0.4 * s);
    a.needsUpdate = true;
  }
  takePet(p) { this.pet = p; this.leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0), V(0, 0)]), new THREE.LineBasicMaterial({ color: '#d6336c' })); scene.add(this.leash); }
  dropPet() { if (this.leash) { scene.remove(this.leash); this.leash.geometry.dispose(); this.leash = null; } const p = this.pet; this.pet = null; return p; }
  remove() { const p = this.dropPet(); if (p) scene.remove(p.obj); this.progress(-1); scene.remove(this.obj); visitors.delete(this); }
}
function adopt(key, v) {
  const list = pens.filter((p) => p.key === key && p.animals.length);
  if (!list.length) return;
  const cx = (p) => (p.rect[0] + p.rect[2]) / 2, p = list.reduce((b, q) => (Math.abs(cx(q) - v.obj.position.x) < Math.abs(cx(b) - v.obj.position.x) ? q : b));
  const a = p.animals.shift(); a.obj.position.set(v.obj.position.x, animalY, v.obj.position.z - 1.1); v.takePet(a);
  sfx.animal(p.kind);
  timers.push({ t: 2.2, res: () => { if (pens.includes(p)) penAnimal(p, true); } });
}
function returnPet(v) {
  const a = v.dropPet(); if (!a) return;
  homeless.push(a); a.walker.walk([HUB, V((a.pen.rect[0] + a.pen.rect[2]) / 2, a.pen.rect[3] + 0.6, animalY)]).then(() => scene.remove(a.obj));
}
const exitHall = (v) => v.walk([V(v.obj.position.x, EXIT_Z), V(-5.0, EXIT_Z), V(-5.0, -1.4), DOOR_IN, DOOR_OUT]);

async function visitorFlow(car, gen) {
  const sx = L.slotX(car.slot) + 1.35, v = new Visitor(V(sx, L.SLOT_Z + 0.4));
  try {
    await v.walk([V(sx, -4.3), DOOR_OUT, DOOR_IN]);
    const key = ws.unlocked.penB && Math.random() < 0.45 ? 'penB' : 'penA', st = stations[key];
    await st.serve(v);
    if (gen !== worldGen) return;
    adopt(key, v); popIcon('😍', v.obj, 1.2, 0.7);
    await v.walk([HUB]);
    let happy = true;
    try { await stations.desk.serve(v); earn(val(key, 'fee'), v.obj.position.clone().setY(2.4)); popIcon('❤️', v.obj, 1.3, 0.7); }
    catch { happy = false; sfx.angry(); popIcon('😠', v.obj, 2, 0.8); returnPet(v); }
    if (gen !== worldGen) return;
    await exitHall(v);
    if (happy && ws.unlocked.shop && Math.random() < val('shop', 'appeal')) {
      const lane = pick([5.05, 8.4]);
      await v.walk([V(-14, -3.0), SHOP_OUT, SHOP_IN, V(-18.3, lane), V(pick([-24.5, -20.6]), lane)]);
      await sleep(rand(0.8, 1.8));
      try { await stations.shop.serve(v); earn(val('shop', 'price'), v.obj.position.clone().setY(2.4)); }
      catch { sfx.angry(); popIcon('😠', v.obj, 2, 0.8); }
      await v.walk([V(-18.6, 10.95), V(-18.6, SHOP_IN.z), SHOP_OUT]);
    }
    await v.walk([V(sx, -4.3), V(sx, L.SLOT_Z + 0.4)]);
  } finally {
    v.remove(); if (gen === worldGen) car.leave();
  }
}

const cars = new Set();
let slotsUsed = new Array(8).fill(null), vip = null;
class Car {
  constructor({ color, gold = false, path, onArrive, speed = 9 }) {
    this.obj = makeCar(color, gold); this.obj.position.y = 0.1; scene.add(this.obj); this.path = path; this.onArrive = onArrive; this.speed = speed;
    const p0 = path.shift(); this.obj.position.x = p0.x; this.obj.position.z = p0.z;
    if (path[0]) this.obj.rotation.y = Math.atan2(path[0].x - p0.x, path[0].z - p0.z);
    cars.add(this);
  }
  update(dt) {
    const seg = this.path[0]; if (!seg) return;
    const p = this.obj.position, dx = seg.x - p.x, dz = seg.z - p.z, d = Math.hypot(dx, dz), sp = (seg.slow ? 4.2 : this.speed) * dt;
    for (const w of this.obj.userData.wheels) w.rotation.x += (seg.rev ? -1 : 1) * sp / 0.36;
    if (d <= sp) { p.x = seg.x; p.z = seg.z; this.path.shift(); if (!this.path.length) this.onArrive?.(this); return; }
    p.x += dx / d * sp; p.z += dz / d * sp;
    this.obj.rotation.y = lerpAngle(this.obj.rotation.y, Math.atan2(dx, dz) + (seg.rev ? Math.PI : 0), Math.min(1, dt * 7));
  }
  leave() {
    const x = L.slotX(this.slot), S = (v, o = {}) => Object.assign(v, o);
    this.path = [S(V(x, L.AISLE_Z), { rev: true, slow: true }), S(V(-11.4, L.AISLE_Z), { slow: true }), S(V(-11.4, -20.1), { slow: true }), V(90, -20.1)];
    slotsUsed[this.slot] = null; this.onArrive = () => this.remove();
  }
  remove() { scene.remove(this.obj); cars.delete(this); }
}
function spawnVisitorCar(slot) {
  const x = L.slotX(slot), S = (v) => Object.assign(v, { slow: true }), gen = worldGen;
  const car = new Car({ path: [V(-90, -20.1), V(-12.6, -20.1), S(V(-12.6, L.AISLE_Z)), S(V(x, L.AISLE_Z)), S(V(x, L.SLOT_Z))], onArrive: (c) => { c.onArrive = null; visitorFlow(c, gen); } });
  car.slot = slot; slotsUsed[slot] = car;
}
function spawnTraffic() { const west = Math.random() < 0.6; new Car({ path: west ? [V(90, -21.9), V(-90, -21.9)] : [V(-90, -20.1), V(90, -20.1)], speed: rand(8, 12), onArrive: (c) => c.remove() }); }
function spawnVip() {
  vip = new Car({ color: '#ffc83d', gold: true, path: [V(-90, -20.1), V(90, -20.1)], speed: 5, onArrive: (c) => { c.remove(); if (vip === c) vip = null; } });
  const tag = textSprite('💰 VIP — click me!', 0.95, { size: 56, bg: '#ffc83dee', color: '#5a3b00' }); tag.position.set(0, 3.1, 0); vip.obj.add(tag);
  vip.obj.traverse((o) => { if (o.isMesh) o.userData.vip = true; });
}
function clickVip() {
  if (!vip) return;
  const bonus = Math.max(80 * W.mult, Math.round(incomeRate() * 30));
  ws.money += bonus; ws.earned += bonus; markDirty();
  floatText(`+${fmt(bonus)}`, vip.obj.position.clone().setY(3.4), '#e8a400', 1.2); floatText('VIP BONUS!', vip.obj.position.clone().setY(4.8), '#e8a400', 1);
  sfx.unlock(); vip.obj.children.filter((c) => c.isSprite).forEach((c) => vip.obj.remove(c)); vip.obj.traverse((o) => { o.userData.vip = false; }); vip = null;
}

// =====================================================================================================
//  Loading a world
// =====================================================================================================
let worldGen = 0, arrows = {}, cones = [], freeSprite = null, freeShown = '';
function clearWorld() {
  worldGen++;
  for (const v of [...visitors]) v.remove();
  for (const c of [...cars]) c.remove(); vip = null;
  for (const p of pens) for (const a of p.animals) scene.remove(a.obj);
  for (const a of yardAnimals) scene.remove(a.obj);
  for (const a of homeless) scene.remove(a.obj); homeless = [];
  for (const s of Object.values(stations)) s.reset();
  for (const a of Object.values(arrows)) scene.remove(a);
  timers.length = 0; slotsUsed = new Array(8).fill(null); cones = []; freeSprite = null; freeShown = '';
  world?.dispose(); world = null;
}
function loadWorld(id) {
  clearWorld();
  W = WORLDS[id - 1]; CFG = economy(W, fmt);
  // Repair/upgrade the saved world so older or partial saves (and saves from future versions) always load.
  const fresh = newWorldState(W, CFG), w0 = save.worlds[id] && typeof save.worlds[id] === 'object' ? save.worlds[id] : fresh;
  if (!Number.isFinite(w0.money)) w0.money = fresh.money;
  if (!Number.isFinite(w0.earned)) w0.earned = 0;
  w0.unlocked = { ...fresh.unlocked, ...(w0.unlocked || {}) };
  w0.lv = w0.lv && typeof w0.lv === 'object' ? w0.lv : {};
  for (const k of ORDER) {
    w0.lv[k] = w0.lv[k] && typeof w0.lv[k] === 'object' ? w0.lv[k] : {};
    for (const t in CFG[k].tracks) { const l = Math.floor(Number(w0.lv[k][t])); w0.lv[k][t] = Math.min(Math.max(1, Number.isFinite(l) ? l : 1), CFG[k].tracks[t].max); }
  }
  w0.done = !!w0.done; save.worlds[id] = w0; ws = w0;
  scene.fog = new THREE.Fog(W.fog, 110, 240);
  skyMat.uniforms.top.value.set(W.sky).offsetHSL(0, 0.1, -0.12); skyMat.uniforms.bottom.value.set(W.fog);
  world = buildWorld(scene, W);
  world.setLocked('penB', !ws.unlocked.penB); world.setLocked('shop', !ws.unlocked.shop);
  makePens(); makeYard(); updateSlots(); world.billboard.scale.setScalar(1 + (ws.lv.parking.ads - 1) * 0.03);
  arrows = {};
  for (const k of ORDER) { const s = textSprite('⬆', 1.15, { size: 70, bg: '#2fbf71', color: '#fff', pad: 14, radius: 60 }); s.position.copy(world.anchors[k]); s.visible = false; s.userData.station = k; scene.add(s); arrows[k] = s; }
  runtime.log = []; runtime.spawnT = 4.5; runtime.vipT = 25; runtime.trafficT = 1;
  $('wc-icon').textContent = CFG.penA.icon; $('wc-num').textContent = `World ${W.id}`; $('wc-name').textContent = W.name;
  audio.setWorld(W.id);
  closePanel(); refreshUI(true);
}
function updateSlots() {
  refreshShadows();
  const n = val('parking', 'slots');
  for (let i = 0; i < 8; i++) {
    world.slotStops[i].material = mat(i < n ? '#f0c34a' : '#9aa0a8');
    if (i >= n && !cones[i]) {
      const c = new THREE.Group(); c.add(mesh(cyl(0.05, 0.32, 0.8, 12), '#ff7f2a', 0, 0.5, 0), mesh(box(0.7, 0.08, 0.7), '#ff7f2a', 0, 0.12, 0), mesh(cyl(0.17, 0.24, 0.12, 12), '#ffffff', 0, 0.55, 0));
      c.position.set(L.slotX(i), 0, L.SLOT_Z); world.group.add(c); cones[i] = c;
    } else if (i < n && cones[i]) { world.group.remove(cones[i]); cones[i] = null; floatText('New space!', V(L.slotX(i), L.SLOT_Z, 2), '#2f7de1', 0.7); }
  }
}
function updateFreeSign() {
  const n = val('parking', 'slots'), used = slotsUsed.slice(0, n).filter(Boolean).length, s = used >= n ? 'FULL' : `${n - used} free`;
  if (s === freeShown) return; freeShown = s;
  if (freeSprite) { world.parkSign.remove(freeSprite); freeSprite.material.map.dispose(); }
  freeSprite = textSprite(s, 0.7, { size: 52, bg: used >= n ? '#e03131ee' : '#2f7de1ee' }); freeSprite.position.set(0, 4.75, 0); world.parkSign.add(freeSprite);
}

// =====================================================================================================
//  Upgrades
// =====================================================================================================
const maxTotal = () => ORDER.reduce((s, k) => s + (CFG[k].unlock ? 1 : 0) + Object.values(CFG[k].tracks).reduce((a, t) => a + t.max - 1, 0), 0);
function progress() {
  let n = 0;
  for (const k of ORDER) { if (CFG[k].unlock && ws.unlocked[k]) n++; for (const t in CFG[k].tracks) n += ws.lv[k][t] - 1; }
  return n / maxTotal();
}
const nextCost = (k, t) => { const tr = CFG[k].tracks[t], l = ws.lv[k][t]; return l >= tr.max ? null : tr.cost(l); };
function canAfford(k) {
  if (!ws.unlocked[k]) return ws.money >= CFG[k].unlock;
  return Object.keys(CFG[k].tracks).some((t) => { const c = nextCost(k, t); return c !== null && ws.money >= c; });
}
function buy(k, t) {
  const c = nextCost(k, t); if (c === null || ws.money < c) return;
  ws.money -= c; ws.lv[k][t]++; sfx.buy(); markDirty();
  floatText(`${CFG[k].tracks[t].label} ↑`, world.anchors[k].clone().setY(4.6), '#ff7a45', 0.8);
  if (k === 'parking') { updateSlots(); world.billboard.scale.setScalar(1 + (ws.lv.parking.ads - 1) * 0.03); }
  tutorialEvent('buy'); refreshUI(true); checkComplete();
}
function unlock(k) {
  if (ws.unlocked[k] || ws.money < CFG[k].unlock) return;
  ws.money -= CFG[k].unlock; ws.unlocked[k] = true; sfx.unlock(); markDirty();
  world.setLocked(k, false);
  if (k === 'penB') pens.filter((p) => p.key === 'penB').forEach((p) => { penAnimal(p, true); penAnimal(p, true); });
  floatText(`${CFG[k].name} open!`, world.anchors[k].clone().setY(5), '#9c6ade', 1.1);
  confetti(world.anchors[k]); refreshShadows(); refreshUI(true); checkComplete(); syncNow();
}
function checkComplete() {
  if (ws.done || progress() < 1) return;
  ws.done = true; markDirty(); syncNow(); sfx.fanfare(); confetti(V(0, 0)); confetti(V(-19, 6)); confetti(V(-18, -10));
  const next = WORLDS[W.id];
  showModal(`<div class="center"><div style="font-size:64px">🏆</div><h2 style="justify-content:center">${W.name} complete!</h2>
    <p>You maxed every upgrade and found homes for so many animals.</p>
    ${next ? `<p><b>World ${next.id}: ${next.name}</b> is now unlocked — ${next.tagline}</p><button class="btn primary big" data-travel="${next.id}">🌍 Travel to ${next.name}</button>` : '<p>You have completed every world available right now. New worlds are coming soon!</p>'}</div>`);
}

// =====================================================================================================
//  Interface
// =====================================================================================================
function summaryFor(k) { const tr = CFG[k].tracks; let a = 0, b = 0; for (const t in tr) { a += ws.lv[k][t] - 1; b += tr[t].max - 1; } return [a, b]; }
function panelHTML(k) {
  const c = CFG[k];
  let h = `<h2>${c.icon} ${c.name}</h2><p class="sub">${c.desc}</p>`;
  if (!ws.unlocked[k]) return h + `<p class="sub">Unlock to start earning here.</p><button class="unlock" data-unlock="${k}">🔓 Unlock · ${fmt(c.unlock)}</button>`;
  for (const [t, tr] of Object.entries(c.tracks)) {
    const l = ws.lv[k][t], cost = nextCost(k, t), now = tr.show(tr.val(l)), next = cost !== null ? tr.show(tr.val(l + 1)) : null;
    h += `<div class="up"><div><b>${tr.label}</b> <span class="lv">Lv ${l}/${tr.max}</span><div class="lvbar"><i style="width:${(l / tr.max) * 100}%"></i></div></div>`;
    h += cost === null ? '<button class="buy max" disabled>MAX</button>' : `<button class="buy" data-buy="${k}:${t}">${fmt(cost)}</button>`;
    h += `<div class="eff">${now}${next ? ` → <em>${next}</em>` : ''}</div></div>`;
  }
  if (stations[k]) h += '<div class="stat"><span>Waiting in line</span><b id="live-stat"></b></div>';
  if (k === 'parking') h += '<div class="stat"><span>Cars parked</span><b id="live-stat"></b></div>';
  if (k === 'office') h += `<div class="stat"><span>Earning now</span><b id="live-stat"></b></div>`;
  return h;
}
let panelShape = '';
function openPanel(k) { runtime.panelKey = k; $('panel').classList.add('show'); sfx.click(); refreshUI(true); tutorialEvent(`open:${k}`); }
function closePanel() { runtime.panelKey = null; $('panel').classList.remove('show'); }
$('px').onclick = closePanel;
$('pbody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.buy) { const [k, t] = b.dataset.buy.split(':'); buy(k, t); }
  if (b.dataset.unlock) unlock(b.dataset.unlock);
});
function refreshUI(force = false) {
  if (!ws) return;
  $('cash').textContent = fmt(ws.money);
  const r = incomeRate(); $('rate').textContent = r > 0 ? `+${fmt(r)}/s` : '';
  const p = progress(); $('pbar').style.width = `${(p * 100).toFixed(1)}%`; $('ptext').textContent = `${Math.floor(p * 100)}% complete`;
  $('travel').hidden = !(ws.done && WORLDS[W.id] && save.current === W.id);
  for (const k of ORDER) arrows[k] && (arrows[k].visible = canAfford(k));
  const k = runtime.panelKey;
  if (k) {
    const shape = k + JSON.stringify(ws.lv[k]) + ws.unlocked[k] + W.id;
    if (force || shape !== panelShape) { $('pbody').innerHTML = panelHTML(k); panelShape = shape; }
    for (const b of $('pbody').querySelectorAll('[data-buy]')) { const [bk, bt] = b.dataset.buy.split(':'); b.disabled = ws.money < nextCost(bk, bt); }
    for (const b of $('pbody').querySelectorAll('[data-unlock]')) b.disabled = ws.money < CFG[b.dataset.unlock].unlock;
    const s = $('live-stat');
    if (s) { if (k === 'parking') { const n = val('parking', 'slots'); s.textContent = `${slotsUsed.slice(0, n).filter(Boolean).length} / ${n}`; } else if (k === 'office') s.textContent = `${fmt(incomeRate())}/s`; else s.textContent = stations[k].waiting.length; }
  }
}
function toast(msg, ms = 2400) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.display = 'none'), ms); }
function showModal(html) { $('mbody').innerHTML = html; $('modal').classList.add('show'); }
function closeModal() { $('modal').classList.remove('show'); }
$('mx').onclick = closeModal;
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) return closeModal();
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.travel) travel(Number(b.dataset.travel));
  if (b.dataset.copy) bridge.copy(b.dataset.copy).then((ok) => toast(ok ? 'Invite link copied! 🎉' : 'Copy the link from the box'));
  if (b.dataset.open) bridge.open(b.dataset.open);
  if (b.dataset.claim) claimRewards();
  if (b.dataset.q) { save.settings.quality = b.dataset.q; applyQuality(b.dataset.q); markDirty(); openSettings(); }
  if (b.id === 'replay-tut') { closeModal(); startTutorial(); }
  if (b.id === 'signout') signOut();
});
$('modal').addEventListener('input', (e) => {
  if (e.target.id === 'vol-music') { save.settings.music = Number(e.target.value); audio.setMusic(save.settings.music); markDirty(); }
  if (e.target.id === 'vol-sfx') { save.settings.sfx = Number(e.target.value); audio.setSfx(save.settings.sfx); markDirty(); }
});

function openWorlds() {
  let h = '<h2>🌍 Worlds</h2><p>Max every upgrade in a world to unlock the next one.</p>';
  for (const w of WORLDS) {
    const st = save.worlds[w.id], prevDone = w.id === 1 || save.worlds[w.id - 1]?.done;
    const cls = w.id === W.id ? 'current' : !prevDone ? 'locked' : '';
    const icon = w.id === 1 ? '🐶' : w.id === 2 ? '🐱' : '🐴';
    const right = w.id === W.id ? '<span class="small"><b>Playing</b></span>'
      : !prevDone ? `<span class="small">🔒 Complete ${WORLDS[w.id - 2].name}</span>`
      : `<button class="btn primary" data-travel="${w.id}">${st ? 'Visit' : 'Travel'}</button>`;
    h += `<div class="world ${cls}"><div class="wi">${icon}</div><div class="sp"><b>World ${w.id} · ${w.name}${st?.done ? ' ✅' : ''}</b><span class="small">${w.tagline}</span></div>${right}</div>`;
  }
  showModal(h);
}
let inviteInfo = null;
function openInvite() {
  const bonus = fmt(inviteBonus(W));
  if (!inviteInfo) return showModal('<h2>🎁 Invite friends</h2><p>Sign in to get your invite link.</p>');
  showModal(`<h2>🎁 Invite friends — you both win!</h2>
    <p>Send your link to a friend. When they sign in to Animal Tycoon <b>on their own PC</b> with it, you <b>both</b> get a huge cash bonus. Invite as many friends as you like!</p>
    <div class="bonus">${bonus}</div><p class="center small">each, in the world you're playing when the bonus arrives</p>
    <div class="linkbox"><input readonly value="${inviteInfo.url}"><button class="btn primary" data-copy="${inviteInfo.url}">Copy</button></div>
    <p class="small">Friends who joined with your link: <b>${inviteInfo.friends || 0}</b></p>`);
}
function openSettings() {
  const s = save.settings;
  showModal(`<h2>⚙️ Settings</h2>
    <div class="setting"><span>🎵 Music</span><input type="range" id="vol-music" min="0" max="1" step="0.05" value="${s.music}"></div>
    <div class="setting"><span>🔊 Sound effects</span><input type="range" id="vol-sfx" min="0" max="1" step="0.05" value="${s.sfx}"></div>
    <div class="setting"><span>✨ Graphics</span><div class="seg"><button data-q="high" class="${s.quality === 'high' ? 'on' : ''}">High</button><button data-q="low" class="${s.quality === 'low' ? 'on' : ''}">Fast</button></div></div>
    <div class="setting"><span>🎓 Tutorial</span><button class="btn ghost" id="replay-tut">Play again</button></div>
    <div class="setting"><span>👤 Signed in as <b>${signedName || 'you'}</b></span><button class="btn ghost" id="signout">Sign out</button></div>
    <p class="small center">Controls: ${TOUCH ? CONTROLS_TEXT : 'WASD or arrow keys to move · Q / E to turn · scroll or + / − to zoom · drag with the mouse'}</p>
    <p class="small center" id="ver"></p>`);
  bridge.info().then((i) => { const v = $('ver'); if (v) v.textContent = `Animal Tycoon v${i.version} · progress saves to your Woof Services account`; });
}
$('b-worlds').onclick = () => { sfx.click(); openWorlds(); };
$('b-invite').onclick = () => { sfx.click(); openInvite(); };
$('b-settings').onclick = () => { sfx.click(); openSettings(); };
$('travel').onclick = () => travel(W.id + 1);

let travelling = false;
async function travel(id) {
  const target = WORLDS[id - 1]; if (!target || travelling) return;
  const prevDone = id === 1 || save.worlds[id - 1]?.done; if (!prevDone) return toast(`Complete ${WORLDS[id - 2].name} first`);
  travelling = true;
  try {
    closeModal(); $('fade').classList.add('on'); await new Promise((r) => setTimeout(r, 550));
    if (id > save.current) save.current = id;
    save.viewing = id; markDirty();
    loadWorld(id); syncNow();
    $('fade').classList.remove('on'); toast(`Welcome to ${target.name}! ${target.tagline}`, 3500);
    if (target.id > 1 && !save.seenTravelTip) { save.seenTravelTip = true; setTimeout(() => toast('Your earlier worlds stay open — visit them any time from 🌍 Worlds.', 4500), 4000); }
  } finally { travelling = false; }
}

// =====================================================================================================
//  Tutorial
// =====================================================================================================
const TUT = [
  { text: '👋 <b>Welcome to Animal Tycoon!</b> You run an animal shelter: families drive in, meet the animals and take one home. Every adoption earns money to grow your shelter.' },
  { text: TOUCH
    ? '🎮 <b>Look around:</b> drag with one finger to move, <b>pinch</b> to zoom and twist two fingers to turn.'
    : '🎮 <b>Look around:</b> WASD or the arrow keys move the camera, <b>Q / E</b> turn it, and the mouse wheel zooms. You can also drag with the mouse.' },
  { text: '🐶 Families visit the <b>Puppy Kennels</b> first. <b>Click the kennels</b> to see their upgrades.', target: 'penA', wait: 'open:penA' },
  { text: '💰 Buy the <b>Adoption fee</b> upgrade — every family will pay more from now on.', wait: 'buy', panel: true },
  { text: '📋 Families pay at the <b>Adoption Desk</b>. If the line gets too long they leave <b>angry</b> without paying — hire clerks and speed it up!', target: 'desk' },
  { text: '⬆ A <b>green arrow</b> above a building means you can afford an upgrade there. The <b>golden VIP car</b> on the road pays a big bonus when you click it.', target: 'parking' },
  { text: '🌍 Max out <b>every upgrade</b> in this world to unlock <b>World 2</b>. Invite friends with the 🎁 button — you <b>both</b> get a huge bonus. Have fun!' },
];
function startTutorial() { runtime.tutorial = 0; $('tut').classList.add('show'); showTutStep(); }
function showTutStep() {
  const i = runtime.tutorial, s = TUT[i];
  if (s === undefined) { $('tut').classList.remove('show'); runtime.tutorial = null; if (!save.tutorialDone) { save.tutorialDone = true; markDirty(); } $('hint').style.opacity = 0.6; return; }
  $('tut-text').innerHTML = s.text; $('tut-step').textContent = `${i + 1} / ${TUT.length}`;
  $('tut-next').hidden = !!s.wait; $('tut-next').textContent = i === TUT.length - 1 ? "Let's go!" : 'Next';
}
$('tut-next').onclick = () => { sfx.click(); runtime.tutorial++; showTutStep(); };
function tutorialEvent(ev) { const s = TUT[runtime.tutorial]; if (runtime.tutorial !== null && s?.wait === ev) { runtime.tutorial++; showTutStep(); } }
function positionTutorial() {
  if (runtime.tutorial === null) return;
  const s = TUT[runtime.tutorial], bubble = document.querySelector('.tut-bubble'), arrow = $('tut-arrow');
  const bw = bubble.offsetWidth || 330, bh = bubble.offsetHeight || 150, small = innerWidth < 760;
  if (s.panel) {
    if (small) { // the panel is a bottom sheet on phones: put the hint above it
      arrow.style.display = 'none'; bubble.style.left = `${(innerWidth - bw) / 2}px`; bubble.style.top = '8px'; return;
    }
    bubble.style.left = `${innerWidth - 380 - bw - 30}px`; bubble.style.top = '120px'; arrow.style.display = 'block'; arrow.textContent = '➡'; arrow.style.left = `${innerWidth - 380 - 34}px`; arrow.style.top = '160px'; return;
  }
  if (s.target && world) {
    const p = world.anchors[s.target].clone(); p.y += 1.2; p.project(camera);
    const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight;
    arrow.style.display = 'block'; arrow.textContent = '⬇'; arrow.style.left = `${x - 22}px`; arrow.style.top = `${y - 62}px`;
    bubble.style.left = `${Math.min(innerWidth - bw - 12, Math.max(12, x - bw / 2))}px`;
    const above = y - bh - 70;
    bubble.style.top = `${above > 70 ? above : Math.min(innerHeight - bh - 12, y + 20)}px`;
  } else { arrow.style.display = 'none'; bubble.style.left = `${(innerWidth - bw) / 2}px`; bubble.style.top = `${(innerHeight - bh) / 2}px`; }
}

// =====================================================================================================
//  Camera: mouse (OrbitControls) + keyboard (move and turn)
// =====================================================================================================
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') { closePanel(); closeModal(); }
  if (e.key === 'F9' && isDev) runtime.speed = runtime.speed === 10 ? 1 : 10;
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
const BOUNDS = { x0: -40, x1: 32, z0: -26, z1: 20 };
function updateCameraKeys(dt) {
  const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  const turn = (keys.has('e') || keys.has('arrowright') ? 1 : 0) - (keys.has('q') || keys.has('arrowleft') ? 1 : 0);
  const zoom = (keys.has('=') || keys.has('+') ? 1 : 0) - (keys.has('-') ? 1 : 0);
  if (!fwd && !side && !turn && !zoom) return;
  const off = camera.position.clone().sub(controls.target), dist = off.length();
  if (turn) { off.applyAxisAngle(V(0, 0, 1), -turn * dt * 1.6); camera.position.copy(controls.target).add(off); }
  if (zoom) { const nd = Math.min(controls.maxDistance, Math.max(controls.minDistance, dist * (1 - zoom * dt * 1.2))); off.setLength(nd); camera.position.copy(controls.target).add(off); }
  if (fwd || side) {
    const f = V(-off.x, -off.z).setY(0).normalize(), r = V(-f.z, f.x), sp = dt * Math.max(14, dist * 0.55);
    const move = f.multiplyScalar(fwd * sp).add(r.multiplyScalar(side * sp));
    const nt = controls.target.clone().add(move);
    nt.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, nt.x)); nt.z = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, nt.z));
    const d = nt.sub(controls.target); controls.target.add(d); camera.position.add(d);
  }
}

// Clicking in the 3D world (ignored when the mouse was dragged)
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; audio.resume(); });
canvas.addEventListener('pointerup', (e) => {
  if (!world || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || e.button !== 0) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const targets = [...world.clickables, ...Object.values(arrows).filter((a) => a.visible)];
  if (vip) vip.obj.traverse((o) => { if (o.isMesh) targets.push(o); });
  const hit = ray.intersectObjects(targets, false)[0]; if (!hit) return closePanel();
  if (hit.object.userData.vip) return clickVip();
  if (hit.object.userData.station) openPanel(hit.object.userData.station);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// =====================================================================================================
//  Cloud: saves, playtime, invite rewards
// =====================================================================================================
let syncing = false;
async function syncNow(final = false) {
  if (!save || syncing) return; syncing = true;
  const minutes = Math.floor(runtime.unsyncedMin);
  try {
    save.playSec = Math.round(runtime.playSec);
    const r = await bridge.cloud.sync({ data: dirty || final ? save : null, baseRevision: revision, minutes });
    if (r?.ok) { revision = r.revision ?? revision; dirty = false; runtime.unsyncedMin -= minutes; if (r.rewards?.length) offerRewards(r.rewards); }
    else if (r?.conflict) {
      // Another PC saved newer progress. Keep whichever save went further.
      revision = r.revision;
      if (r.save && score(r.save) > score(save)) { save = normalizeSave(r.save); loadWorld(save.viewing || save.current); toast('Loaded your newer progress from another PC'); }
      else { syncing = false; return syncNow(final); }
    }
  } catch { /* offline: try again next time */ }
  syncing = false;
}
let pendingRewards = [];
function offerRewards(list) {
  const ids = new Set(pendingRewards.map((r) => r.id)); for (const r of list) if (!ids.has(r.id)) pendingRewards.push(r);
  if (!pendingRewards.length || $('modal').classList.contains('show')) return;
  const units = pendingRewards.reduce((s, r) => s + (r.units || 1), 0);
  showModal(`<div class="center"><div style="font-size:64px">🎁</div><h2 style="justify-content:center">Friend bonus!</h2>
    <p>${pendingRewards.length === 1 ? pendingRewards[0].reason : `${pendingRewards.length} invite bonuses are waiting`}</p>
    <div class="bonus">+${fmt(inviteBonus(W) * units)}</div><button class="btn primary big" data-claim="1">Collect</button></div>`);
}
async function claimRewards() {
  const ids = pendingRewards.map((r) => r.id); if (!ids.length) return closeModal();
  try {
    const r = await bridge.cloud.claim(ids), got = new Set(r?.claimed || []);
    const units = pendingRewards.filter((x) => got.has(x.id)).reduce((s, x) => s + (x.units || 1), 0);
    if (units) { const v = inviteBonus(W) * units; ws.money += v; ws.earned += v; markDirty(); confetti(V(-4, -2)); sfx.fanfare(); floatText(`+${fmt(v)}`, V(-4, -2, 5), '#21a35b', 1.4); syncNow(); }
    pendingRewards = pendingRewards.filter((x) => !got.has(x.id));
  } catch { toast('Could not collect right now — try again in a moment'); }
  closeModal(); refreshUI(true);
}
async function signOut() {
  await syncNow(true); await bridge.auth.signOut(); location.reload();
}
bridge.onQuit?.(async () => { await Promise.race([syncNow(true), new Promise((r) => setTimeout(r, 4000))]); bridge.quitReady(); });
// Minimised / switched away (phones especially): pause the music and save; carry on when the player is back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { audio.pause?.(); if (save) syncNow(); } else audio.resume();
});
// Android back button: close whatever is open first; returns true when it handled the press.
window.__woofBack = () => {
  if ($('modal').classList.contains('show')) { closeModal(); return true; }
  if (runtime.panelKey) { closePanel(); return true; }
  return false;
};

// =====================================================================================================
//  Updates (Windows/Mac: downloads in the background; Android: downloads, then one tap to install)
// =====================================================================================================
// Updates are forced. At launch the loading screen waits for the new version (see boot); while playing, a downloaded
// update saves the game and restarts it after a short countdown.
let updateInfo = null, bootUpdate = null, restartTimer = null;
const pctText = (u) => (Number.isFinite(u.percent) ? ` ${u.percent}%` : '');
bridge.onUpdate?.((u) => {
  updateInfo = u;
  if (bootUpdate) return bootUpdate(u); // the loading screen is showing the update
  const box = $('update');
  if (u.state === 'downloading') { box.hidden = false; $('update-text').textContent = u.message || `⬇ Downloading update ${u.version || ''}…${pctText(u)}`; $('update-now').hidden = true; }
  if (u.state === 'ready') {
    box.hidden = false; $('update-now').textContent = 'Update now'; $('update-now').hidden = false;
    let left = 10;
    const tickDown = () => { $('update-text').textContent = `✨ Animal Tycoon ${u.version || ''} is ready — saving and updating in ${left}s…`; if (left-- <= 0) installUpdate(); };
    clearInterval(restartTimer); tickDown(); restartTimer = setInterval(tickDown, 1000);
  }
  if (u.state === 'installing') { box.hidden = false; $('update-text').textContent = `✨ Installing Animal Tycoon ${u.version || ''}…`; $('update-now').hidden = true; }
  if (u.state === 'permission' || u.state === 'manual') { box.hidden = false; $('update-text').textContent = u.message || `✨ Animal Tycoon ${u.version || ''} is available.`; $('update-now').textContent = u.button || 'Download'; $('update-now').hidden = false; }
});
async function installUpdate() {
  clearInterval(restartTimer); $('update-now').hidden = true; $('update-text').textContent = '💾 Saving your game…';
  await Promise.race([syncNow(true), new Promise((r) => setTimeout(r, 5000))]);
  $('update-text').textContent = `✨ Installing Animal Tycoon ${updateInfo?.version || ''}…`;
  bridge.restartToUpdate();
}
$('update-now').onclick = () => {
  if (updateInfo?.state === 'manual') return bridge.open(updateInfo.url || 'https://woof-services.stream/animal-tycoon');
  if (updateInfo?.state === 'permission') return bridge.restartToUpdate(); // Android: opens the permission screen / installs
  installUpdate();
};
/**
 * Launch: check for a new version before anything else. If one is coming, the loading screen shows the download and
 * the app installs and reopens itself. Returns only if the game should start normally (no update, offline, or a failed download).
 */
async function updateFirst() {
  if (!bridge.checkForUpdate) return;
  setLoad(12, 'Checking for updates…');
  const up = await Promise.race([bridge.checkForUpdate(), new Promise((r) => setTimeout(() => r(null), 9000))]).catch(() => null);
  if (!up || up.status === 'none') return;
  const btn = $('load-action');
  await new Promise((resolve) => {
    let stall = null;
    const keepWaiting = () => { clearTimeout(stall); stall = setTimeout(() => { bootUpdate = null; btn.hidden = true; resolve(); }, 120_000); };
    bootUpdate = (u) => {
      keepWaiting();
      if (u.state === 'downloading') setLoad(Math.max(12, u.percent ?? 12), u.message || `Updating to Animal Tycoon ${u.version || up.version}…${pctText(u)}`);
      if (u.state === 'installing' || u.state === 'ready') { setLoad(100, `Installing Animal Tycoon ${u.version || up.version} — the game will reopen by itself…`); btn.hidden = true; if (u.state === 'ready') bridge.restartToUpdate(); }
      if (u.state === 'permission') { $('loadtext').textContent = u.message; btn.textContent = u.button || 'Allow updates'; btn.hidden = false; btn.onclick = () => bridge.restartToUpdate(); }
      if (u.state === 'error') { clearTimeout(stall); bootUpdate = null; btn.hidden = true; resolve(); } // couldn't update now: play, it retries later
    };
    if (up.status === 'manual') { // Mac app that can't replace itself (still in Downloads or a disk image)
      clearTimeout(stall);
      $('loadtext').textContent = up.message || `Animal Tycoon ${up.version} is out — please install the new version.`;
      btn.textContent = 'Download the new version'; btn.hidden = false; btn.onclick = () => bridge.open(up.url || 'https://woof-services.stream/animal-tycoon');
      return; // stays here: the old version doesn't start
    }
    setLoad(15, `Updating to Animal Tycoon ${up.version}…`);
    keepWaiting();
  });
}

// =====================================================================================================
//  Main loop
// =====================================================================================================
const clock = new THREE.Clock(); let uiT = 0, syncT = 0;
runtime.speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
const autoBuy = isDev && new URLSearchParams(location.search).get('auto') === '1';
let lastFrame = 0, shadowT = 0;
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  // Frame cap: 60 fps on High, 30 on Fast, 20 while the window is in the background (saves GPU, CPU and battery).
  const budget = document.hasFocus() ? frameMs : 1000 / 20;
  if (now - lastFrame < budget - 2) return;
  lastFrame = now;
  const real = Math.min(clock.getDelta(), 0.05);
  shadowT += real; if (shadowT > 6) { shadowT = 0; refreshShadows(); } // trees sway a little: refresh their shadows now and then
  if (ws) {
    const steps = Math.ceil(runtime.speed), dt = real * runtime.speed / steps;
    for (let i = 0; i < steps; i++) tick(dt);
    if (document.hasFocus() && !document.hidden) { runtime.playSec += real; runtime.unsyncedMin += real / 60; }
    uiT += real; if (uiT > 0.2) { uiT = 0; refreshUI(); }
    syncT += real; if (syncT > 120) { syncT = 0; syncNow(); }
    updateCameraKeys(real); positionTutorial();
    world?.update(real, runtime.time, quality === 'high');
  }
  controls.update();
  // Keep the view over the shelter (touch panning and mouse panning can otherwise drift off the map).
  const t = controls.target, cx = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, t.x)) - t.x, cz = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, t.z)) - t.z;
  if (cx || cz || t.y) { const d = V(cx, cz, -t.y); t.add(d); camera.position.add(d); }
  renderer.render(scene, camera);
}
let autoT = 0;
function tick(dt) {
  runtime.time += dt; const t = runtime.time;
  runtime.spawnT += dt; runtime.trafficT -= dt; runtime.vipT -= dt;
  const n = val('parking', 'slots');
  if (runtime.spawnT >= val('parking', 'ads')) { const free = [...Array(n).keys()].filter((i) => !slotsUsed[i]); if (free.length) { runtime.spawnT = 0; spawnVisitorCar(pick(free)); } }
  if (runtime.trafficT <= 0) { runtime.trafficT = rand(2.5, 6); spawnTraffic(); }
  if (runtime.vipT <= 0) { runtime.vipT = val('office', 'vip') * rand(0.8, 1.2); if (!vip) spawnVip(); }
  for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const r = timers[i].res; timers.splice(i, 1); r(); } }
  for (const c of [...cars]) c.update(dt);
  for (const s of Object.values(stations)) s.update(dt, t);
  for (const v of [...visitors]) v.update(dt, t);
  for (let i = homeless.length - 1; i >= 0; i--) { const a = homeless[i]; a.walker.update(dt); animateAnimal(a.obj, t, a.walker.moving); if (!a.walker.moving) homeless.splice(i, 1); }
  updatePens(dt, t); updateYard(dt, t); updateFx(dt); updateBits(dt); updateFreeSign();
  for (const a of Object.values(arrows)) a.position.y = (a.userData.baseY ??= a.position.y) + Math.sin(t * 3) * 0.15;
  if (autoBuy) { autoT += dt; if (autoT > 0.5) { autoT = 0; autoStep(); } }
}
function autoStep() { // development helper: plays like a sensible person
  const locked = ORDER.filter((k) => !ws.unlocked[k]).sort((a, b) => CFG[a].unlock - CFG[b].unlock)[0];
  if (locked && ws.money >= CFG[locked].unlock) return unlock(locked);
  let best = null;
  for (const k of ORDER) if (ws.unlocked[k]) for (const t in CFG[k].tracks) { const c = nextCost(k, t); if (c !== null && (!best || c < best.c)) best = { c, f: () => buy(k, t) }; }
  if (!best) { if (ws.done && WORLDS[W.id]) travel(W.id + 1); return; }
  if (locked && best.c > CFG[locked].unlock * 0.2 && incomeRate() * 40 > CFG[locked].unlock - ws.money) return;
  if (ws.money >= best.c) best.f();
}
// Development only: renders a clean high-resolution still (no upgrade arrows) and uploads it to the dev server.
async function devShot(name, w = 1920, h = 1080, pose = null) {
  if (!isDev) return;
  if (pose) { camera.position.set(...pose.cam); controls.target.set(...pose.target); controls.update(); }
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio(), shown = Object.values(arrows).map((a) => a.visible);
  Object.values(arrows).forEach((a) => { a.visible = false; });
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/jpeg', 0.9);
  renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y); camera.aspect = size.x / size.y; camera.updateProjectionMatrix();
  Object.values(arrows).forEach((a, i) => { a.visible = shown[i]; });
  const bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  return (await fetch(`/upload/${name}`, { method: 'PUT', body: blob })).status;
}
if (isDev) window.__game = { shot: devShot, get time() { return runtime.time; }, sim: async (sec) => { for (let i = 0; i < sec * 20; i++) { tick(0.05); for (let k = 0; k < 4; k++) await null; } }, get save() { return save; }, get ws() { return ws; }, progress: () => progress(), incomeRate, setSpeed: (s) => { runtime.speed = s; }, get world() { return W; }, travel };

// =====================================================================================================
//  Start-up: loading screen → sign in → cloud save → play
// =====================================================================================================
const setLoad = (p, text) => { $('loadbar').style.width = `${p}%`; if (text) $('loadtext').textContent = text; };
// Waits for a frame so the loading bar can paint; falls back to a timer when the window is minimised.
const nextFrame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 120); });
let tipI = Math.floor(Math.random() * TIPS.length);
const tipTimer = setInterval(() => { $('loadtip').textContent = TIPS[tipI++ % TIPS.length]; }, 2600); $('loadtip').textContent = TIPS[tipI++ % TIPS.length];

async function signIn() {
  $('login').classList.add('show'); $('login-err').hidden = true;
  return new Promise((resolve) => {
    let active = false;
    const begin = async () => {
      if (active) return; active = true; $('login-err').hidden = true;
      try {
        const s = await bridge.auth.start();
        $('login-start').hidden = true; $('login-wait').hidden = false; $('login-code').textContent = s.code;
        $('login-open').onclick = () => bridge.open(s.url);
        const r = await bridge.auth.wait();
        if (r.status === 'approved') { $('login').classList.remove('show'); resolve(r); return; }
        throw new Error(r.status === 'denied' ? 'The sign-in was denied. Try again.' : r.error || 'That code expired. Try again.');
      } catch (e) {
        active = false; $('login-start').hidden = false; $('login-wait').hidden = true;
        $('login-err').textContent = e.message || 'Could not reach Woof Services. Check your internet and try again.'; $('login-err').hidden = false;
      }
    };
    $('signin').onclick = () => { sfx.click(); begin(); };
    $('login-cancel').onclick = () => { bridge.auth.cancel(); active = false; $('login-start').hidden = false; $('login-wait').hidden = true; };
  });
}

async function boot() {
  setLoad(10, 'Warming up the engine…'); await nextFrame();
  applyQuality(TOUCH ? 'low' : 'high');
  $('hint').textContent = CONTROLS_TEXT;
  await updateFirst();
  setLoad(25, 'Checking your account…');
  let st = await bridge.auth.status().catch(() => ({ signedIn: false }));
  if (!st.signedIn) { $('loading').classList.remove('show'); const r = await signIn(); st = { signedIn: true, name: r.name }; $('loading').classList.add('show'); }
  setLoad(45, 'Loading your save from the cloud…');
  let session = null;
  for (let i = 0; i < 3 && !session; i++) { session = await bridge.cloud.session().catch(() => null); if (!session?.ok) { if (session?.signedOut) { await bridge.auth.signOut(); location.reload(); return; } session = null; await new Promise((r) => setTimeout(r, 1500)); } }
  if (!session) { setLoad(45, 'Could not reach Woof Services. Retrying…'); setTimeout(() => location.reload(), 4000); return; }
  signedName = session.name || st.name || ''; $('who').textContent = `👤 ${signedName || 'Signed in'}`;
  inviteInfo = session.invite || null; revision = session.revision || 0;
  save = normalizeSave(session.save);
  if (!session.save) dirty = true;
  applyQuality(save.settings.quality); audio.setMusic(save.settings.music); audio.setSfx(save.settings.sfx);
  runtime.playSec = save.playSec || 0;
  setLoad(65, 'Building your world…'); await nextFrame();
  loadWorld(save.viewing || save.current);
  setLoad(90, 'Letting the animals out…'); await nextFrame();
  for (let i = 0; i < 20; i++) tick(0.05);
  setLoad(100, 'Ready!'); await new Promise((r) => setTimeout(r, 350));
  clearInterval(tipTimer);
  $('loading').classList.remove('show'); $('hud').hidden = false;
  audio.start(W.id);
  if (!save.tutorialDone) setTimeout(startTutorial, 800);
  if (session.rewards?.length) setTimeout(() => offerRewards(session.rewards), save.tutorialDone ? 1200 : 60000);
  syncNow();
}
frame();
boot();
