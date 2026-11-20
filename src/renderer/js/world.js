// Builds one themed world (scenery, buildings, pens, signs). Every world shares this layout; the theme sets
// the colours, animals, signs and decorations. Returns handles the simulation needs (anchors, locks, slots).
import * as THREE from 'three';
import { V, rand, pick, mesh, mat, rbox, box, cyl, cone, ico, sphere, signBoard, textSprite, tileTexture, tree, cloud } from './models.js';

export const LAYOUT = {
  ROAD_Z: -21, LOT: { x0: -28, x1: -9, z0: -16, z1: -3.5 }, SLOT_Z: -7.2, AISLE_Z: -12.6,
  slotX: (i) => -25.2 + i * 2.55,
  AD: { x0: -6, x1: 12, z0: -10, z1: 6 }, SH: { x0: -27, x1: -12, z0: 0.5, z1: 12 }, YARD: { x0: 15, x1: 27, z0: -11, z1: 5 },
  PEN_A: [[-5.4, -9.6, -2.4, -5.6], [-2.2, -9.6, 0.8, -5.6], [1, -9.6, 4, -5.6]],
  PEN_B: [[4.6, -9.6, 8, -5.6], [8.2, -9.6, 11.6, -5.6]],
  OFFICE: { x: -8.6, z: 9.6 },
};

export function buildWorld(scene, th) {
  const L = LAYOUT, g = new THREE.Group(); scene.add(g);
  const clickables = [], swayers = [], clouds = [];
  const add = (...o) => { g.add(...o); return o[0]; };

  // ---- ground
  const grass = add(mesh(new THREE.PlaneGeometry(320, 320), th.grass)); grass.rotation.x = -Math.PI / 2; grass.castShadow = false;
  for (let i = 0; i < 30; i++) { const p = add(mesh(new THREE.CircleGeometry(rand(2, 5), 18), pick(th.patches))); p.rotation.x = -Math.PI / 2; p.position.set(rand(-70, 70), 0.01, rand(-60, 60)); p.castShadow = false; }

  // ---- road + sidewalks
  add(mesh(box(220, 0.1, 6), '#4a4f5a', 0, 0.05, L.ROAD_Z));
  for (let x = -108; x < 110; x += 6) add(mesh(box(2.4, 0.11, 0.25), '#f3f3f3', x, 0.06, L.ROAD_Z));
  add(mesh(box(220, 0.18, 1.6), '#ddd6c8', 0, 0.09, L.ROAD_Z + 3.8), mesh(box(220, 0.18, 1.6), '#ddd6c8', 0, 0.09, L.ROAD_Z - 3.8));

  // ---- parking lot
  const { LOT } = L;
  add(mesh(box(LOT.x1 - LOT.x0, 0.12, LOT.z1 - LOT.z0), '#5d6370', (LOT.x0 + LOT.x1) / 2, 0.06, (LOT.z0 + LOT.z1) / 2));
  add(mesh(box(4.6, 0.13, 4.4), '#5d6370', -12, 0.065, -17.6));
  for (let i = 0; i <= 8; i++) add(mesh(box(0.12, 0.14, 4.2), '#ffffff', L.slotX(i) - 1.275, 0.07, L.SLOT_Z));
  for (let x = -26; x < -10; x += 3) add(mesh(box(1.6, 0.14, 0.25), '#ffffff', x, 0.07, L.AISLE_Z));
  const slotStops = [];
  for (let i = 0; i < 8; i++) slotStops.push(add(mesh(rbox(1.4, 0.18, 0.35, 0.05), '#f0c34a', L.slotX(i), 0.1, L.SLOT_Z + 2.4)));
  add(mesh(box(LOT.x1 - LOT.x0, 0.3, 0.3), '#cfc8ba', (LOT.x0 + LOT.x1) / 2, 0.15, LOT.z1), mesh(box(0.3, 0.3, LOT.z1 - LOT.z0), '#cfc8ba', LOT.x0, 0.15, (LOT.z0 + LOT.z1) / 2));
  // walking path from the lot to both doors
  add(mesh(box(19, 0.16, 1.6), '#e6dfd1', -17.5, 0.08, -2.6), mesh(box(2.4, 0.16, 2.4), '#e6dfd1', -8.2, 0.08, -2.5));

  const parkSign = add(new THREE.Group()); parkSign.position.set(-9.6, 0, -15.2);
  parkSign.add(mesh(cyl(0.09, 0.09, 3.2), '#8a8f99', 0, 1.6, 0));
  const pb = signBoard('P', 1.3, 1.3, '#2f7de1'); pb.position.set(0, 3.6, 0); pb.rotation.y = -0.4; parkSign.add(pb);

  const billboard = add(new THREE.Group()); billboard.position.set(-34, 0, -15);
  billboard.add(mesh(cyl(0.18, 0.18, 4), '#7b5b3a', -2, 2, 0), mesh(cyl(0.18, 0.18, 4), '#7b5b3a', 2, 2, 0));
  const bbf = signBoard(th.billboard, 6, 2.2, th.billboardColor); bbf.position.set(0, 4.8, 0); bbf.rotation.y = 0.35; billboard.add(bbf);

  // ---- trees, lamps, flowers
  const lamp = (x, z) => { const l = add(new THREE.Group()); l.position.set(x, 0, z); l.add(mesh(cyl(0.08, 0.12, 4, 8), '#4b5563', 0, 2, 0), mesh(rbox(0.6, 0.25, 0.6, 0.08), '#4b5563', 0, 4.05, 0), mesh(sphere(0.2, 10), '#fff6c8', 0, 3.85, 0, { emissive: '#fff1a0', emissiveIntensity: 0.6 })); };
  const plantTree = (x, z, s) => { const t = add(tree(x, z, s, th.trees)); swayers.push(t); };
  for (let x = -66; x <= 66; x += 9) if (Math.abs(x + 12) > 4) plantTree(x + rand(-1, 1), -28 + rand(-1, 1), rand(0.9, 1.25));
  for (let x = -48; x <= 48; x += 12) lamp(x, L.ROAD_Z + 4.6);
  [[-33, -6], [-34, 4], [-31, 15], [-20, 18], [-4, 16], [8, 17], [22, 16], [31, 12], [32, -2], [31, -12], [-38, -10], [-40, 10], [40, 4], [-12, 20], [-46, 0], [44, -8], [14, 22], [-28, 24]]
    .forEach(([x, z]) => plantTree(x, z, rand(0.9, 1.35)));
  for (let i = 0; i < 10; i++) add(mesh(ico(rand(0.5, 0.8), 0), pick(['#58b84f', '#4aa846']), rand(-30, -27.6), 0.45, rand(-3, 14)));
  const flowers = (x, z, w, d) => {
    add(mesh(rbox(w, 0.35, d, 0.1), '#8b5e3c', x, 0.17, z));
    for (let i = 0; i < w * d * 2; i++) add(mesh(sphere(0.13, 6), pick(['#ff6b8b', '#ffd23f', '#ffffff', '#b388ff']), x + rand(-w / 2 + 0.2, w / 2 - 0.2), 0.42, z + rand(-d / 2 + 0.2, d / 2 - 0.2)));
  };
  flowers(14, 8.5, 5, 1.2); flowers(-2.5, 8.4, 5, 1.2);

  // ---- fences
  const fence = (x0, z0, x1, z1, color = '#ffffff', h = 0.9) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.2)), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) add(mesh(rbox(0.16, h, 0.16, 0.04), color, x0 + (x1 - x0) * i / n, h / 2, z0 + (z1 - z0) * i / n));
    for (const y of [h * 0.4, h * 0.85]) { const r = add(mesh(box(0.08, 0.1, len), color, (x0 + x1) / 2, y, (z0 + z1) / 2)); r.rotation.y = ang; }
  };

  // ---- play yard / garden / paddock (decoration with animals running around)
  const { YARD } = L, yardFence = th.yardAnimal === 'pony' ? '#a5764a' : '#ffffff';
  add(mesh(box(YARD.x1 - YARD.x0, 0.08, YARD.z1 - YARD.z0), th.yardGround, (YARD.x0 + YARD.x1) / 2, 0.04, (YARD.z0 + YARD.z1) / 2));
  fence(YARD.x0, YARD.z0, YARD.x1, YARD.z0, yardFence); fence(YARD.x1, YARD.z0, YARD.x1, YARD.z1, yardFence); fence(YARD.x0, YARD.z1, YARD.x1, YARD.z1, yardFence); fence(YARD.x0, YARD.z0, YARD.x0, YARD.z1, yardFence);
  if (th.yardAnimal === 'dog') {
    const dh = add(new THREE.Group()); dh.position.set(25, 0, -8.5); dh.rotation.y = -0.6;
    dh.add(mesh(rbox(2.2, 1.5, 2, 0.08), '#e0563f', 0, 0.75, 0));
    const rl = mesh(box(1.4, 0.15, 2.3), '#7a3b2e', -0.55, 1.75, 0); rl.rotation.z = 0.7; const rr = mesh(box(1.4, 0.15, 2.3), '#7a3b2e', 0.55, 1.75, 0); rr.rotation.z = -0.7;
    dh.add(rl, rr, mesh(box(0.8, 0.9, 0.05), '#3a2a26', 0, 0.55, 1.01));
    [[19, 2, '#ff4d6d'], [23, -3, '#4dabf7'], [17.5, -7, '#ffd43b']].forEach(([x, z, c]) => add(mesh(sphere(0.25, 12), c, x, 0.25, z)));
  } else if (th.yardAnimal === 'cat') {
    for (let i = 0; i < 4; i++) flowers(rand(16.5, 25.5), rand(-9.5, 3.5), 1.6, 1);
    const ct = add(new THREE.Group()); ct.position.set(24.5, 0, -8);
    ct.add(mesh(cyl(0.18, 0.18, 2.6, 10), '#d4b48c', 0, 1.3, 0), mesh(cyl(0.8, 0.8, 0.14, 16), '#e599c3', 0, 1.2, 0), mesh(cyl(0.6, 0.6, 0.14, 16), '#e599c3', 0, 2.6, 0));
    [[19, 2, '#ff8787'], [22, -4, '#748ffc']].forEach(([x, z, c]) => add(mesh(sphere(0.22, 10), c, x, 0.22, z)));
  } else {
    const barn = add(new THREE.Group()); barn.position.set(24, 0, 12); barn.rotation.y = -0.4;
    barn.add(mesh(rbox(5, 3.4, 4.4, 0.1), '#c0392b', 0, 1.7, 0));
    const r1 = mesh(box(3.3, 0.25, 4.8), '#6d4c41', -1.25, 3.95, 0); r1.rotation.z = 0.62; const r2 = mesh(box(3.3, 0.25, 4.8), '#6d4c41', 1.25, 3.95, 0); r2.rotation.z = -0.62;
    barn.add(r1, r2, mesh(box(1.8, 2.2, 0.08), '#ffffff', 0, 1.1, 2.22), mesh(box(1.6, 2, 0.1), '#8d2b20', 0, 1.1, 2.24));
    for (const [x, z] of [[18, -9], [19.5, -9.2], [24.5, 3.2]]) add(mesh(rbox(1.3, 0.9, 0.9, 0.12), '#e9c46a', x, 0.45, z));
    add(mesh(rbox(2.4, 0.6, 0.9, 0.08), '#8d6e63', 21, 0.3, 3.4), mesh(box(2.2, 0.1, 0.7), '#4dabf7', 21, 0.58, 3.4));
  }
  const ys = signBoard(th.yard, 3.2, 0.9, th.billboardColor); ys.position.set(21, 1.6, 5.2); add(ys);

  // ---- buildings
  const wall = (x0, z0, x1, z1, h, color, trim) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    const w = add(mesh(box(0.35, h, len), color, (x0 + x1) / 2, h / 2, (z0 + z1) / 2)); w.rotation.y = ang;
    if (trim) { const t = add(mesh(box(0.5, 0.25, len + 0.2), trim, (x0 + x1) / 2, h + 0.1, (z0 + z1) / 2)); t.rotation.y = ang; }
  };
  const floor = (x0, z0, x1, z1, tex) => {
    tex.repeat.set((x1 - x0) / 4, (z1 - z0) / 4);
    const m = add(new THREE.Mesh(box(x1 - x0, 0.2, z1 - z0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })));
    m.position.set((x0 + x1) / 2, 0.1, (z0 + z1) / 2); m.receiveShadow = true;
  };

  // Main building (adoption hall)
  const { AD } = L, M = th.main;
  floor(AD.x0, AD.z0, AD.x1, AD.z1, tileTexture(M.floor[0], M.floor[1]));
  wall(AD.x0, AD.z0, AD.x1, AD.z0, 3.2, M.wall, M.trim);
  wall(AD.x0, AD.z0, AD.x0, -4.2, 3.2, M.wall, M.trim);
  wall(AD.x0, -0.8, AD.x0, AD.z1, 3.2, M.wall, M.trim);
  wall(AD.x0, AD.z1, AD.x1, AD.z1, 0.7, M.wall, M.trim);
  wall(AD.x1, AD.z0, AD.x1, AD.z1, 0.7, M.wall, M.trim);
  add(mesh(box(0.4, 0.25, 3.8), M.trim, AD.x0, 3.3, -2.5));
  const mainSign = signBoard(M.sign, 10, 1.9, M.trim); mainSign.position.set(3, 4.9, AD.z0 + 0.1); add(mainSign);
  add(mesh(box(1.6, 0.22, 3.2), '#c0392b', AD.x0 - 1, 0.11, -2.5));
  // windows on the back wall
  for (const x of [-3, 9]) add(mesh(rbox(2.2, 1.2, 0.1, 0.05), '#bfe3ff', x, 2.2, AD.z0 + 0.2, { roughness: 0.1, metalness: 0.3 }));

  // Pens
  const penDecor = (x0, z0, x1, z1) => {
    if (th.penA.animal === 'cat') {
      add(mesh(cyl(0.12, 0.12, 1.4, 8), '#d4b48c', x0 + 0.6, 0.85, z0 + 0.7), mesh(cyl(0.45, 0.45, 0.1, 14), '#e599c3', x0 + 0.6, 1.5, z0 + 0.7), mesh(cyl(0.4, 0.4, 0.1, 14), '#e599c3', x0 + 0.6, 0.7, z0 + 0.7));
      add(mesh(sphere(0.16, 10), pick(['#ff8787', '#748ffc', '#ffd43b']), x1 - 0.7, 0.36, z1 - 0.8));
    } else if (th.penA.animal === 'bunny' || th.penA.animal === 'pony') {
      add(mesh(rbox(0.9, 0.55, 0.6, 0.08), '#e9c46a', x0 + 0.7, 0.5, z0 + 0.6), mesh(rbox(0.9, 0.3, 0.45, 0.05), '#8d6e63', x1 - 0.8, 0.38, z0 + 0.6), mesh(box(0.8, 0.06, 0.35), '#74c0fc', x1 - 0.8, 0.53, z0 + 0.6));
    } else {
      add(mesh(cyl(0.28, 0.22, 0.16, 12), '#4dabf7', x0 + 0.6, 0.3, z0 + 0.7), mesh(rbox(0.9, 0.18, 0.7, 0.08), pick(['#ff8fab', '#a5d8ff', '#ffe066']), x1 - 0.8, 0.3, z0 + 0.7));
    }
  };
  const pen = ([x0, z0, x1, z1], straw, fc) => {
    add(mesh(box(x1 - x0 - 0.2, 0.23, z1 - z0 - 0.2), straw, (x0 + x1) / 2, 0.12, (z0 + z1) / 2));
    fence(x0, z1, x1, z1, fc, 0.8); fence(x0, z0 + 0.25, x0, z1, fc, 0.8); fence(x1, z0 + 0.25, x1, z1, fc, 0.8);
    penDecor(x0, z0, x1, z1);
  };
  L.PEN_A.forEach((p) => pen(p, th.penA.straw, '#8fb3d9'));
  L.PEN_B.forEach((p) => pen(p, th.penB.straw, th.penB.animal === 'pony' ? '#a5764a' : '#8fb3d9'));
  const sa = signBoard(th.penA.sign, 3.2, 0.7, th.penA.color); sa.position.set(-0.7, 2.4, -9.7); add(sa);
  const sb = signBoard(th.penB.sign, 3.2, 0.7, th.penB.color); sb.position.set(8.1, 2.4, -9.7); add(sb);

  // Adoption desk
  add(mesh(rbox(8.6, 1.05, 0.9, 0.12), '#ffffff', 6.2, 0.62, 2.0), mesh(rbox(8.8, 0.12, 1.1, 0.05), M.trim, 6.2, 1.2, 2.0));
  for (const x of [3.6, 6.2, 8.8]) add(mesh(rbox(0.6, 0.4, 0.05, 0.03), '#2b2433', x, 1.5, 1.8), mesh(box(0.1, 0.2, 0.1), '#2b2433', x, 1.3, 1.8));
  const ds = signBoard(th.desk.sign, 2.8, 0.65, th.desk.color); ds.position.set(6.2, 2.6, 1.5); add(ds);
  // waiting benches (the comfy waiting area) and plants
  add(mesh(rbox(1.4, 0.5, 0.6, 0.15), '#7c5cff', -4.5, 0.45, 4.95), mesh(rbox(1.4, 0.5, 0.6, 0.15), '#7c5cff', -2.6, 0.45, 4.95));
  const plant = (x, z) => add(mesh(cyl(0.3, 0.24, 0.5, 10), '#c96f4a', x, 0.45, z), mesh(ico(0.5, 0), '#4caf50', x, 1.0, z));
  plant(-5.3, -4.8); plant(11.3, 5.3);

  // Shop
  const { SH } = L, S = th.shop;
  floor(SH.x0, SH.z0, SH.x1, SH.z1, tileTexture(S.floor[0], S.floor[1]));
  wall(SH.x0, SH.z0, -20.6, SH.z0, 3.2, S.wall, S.trim); wall(-16.8, SH.z0, SH.x1, SH.z0, 3.2, S.wall, S.trim);
  wall(SH.x0, SH.z0, SH.x0, SH.z1, 3.2, S.wall, S.trim); wall(SH.x0, SH.z1, SH.x1, SH.z1, 0.7, S.wall, S.trim); wall(SH.x1, SH.z0, SH.x1, SH.z1, 0.7, S.wall, S.trim);
  add(mesh(box(4.2, 0.25, 0.4), S.trim, -18.7, 3.3, SH.z0));
  const ss = signBoard(S.sign, 8, 1.7, S.trim); ss.position.set(-19.5, 4.8, SH.z0 + 0.1); add(ss);
  const shelf = (x, z) => {
    const s = add(new THREE.Group()); s.position.set(x, 0, z);
    s.add(mesh(rbox(3.2, 1.7, 0.8, 0.06), '#f2efe8', 0, 0.95, 0));
    for (const y of [0.55, 1.05, 1.55]) for (let i = 0; i < 6; i++) {
      const c = pick(['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#b197fc', '#ff922b']);
      if (S.goods === 'coffee') s.add(mesh(cyl(0.12, 0.1, 0.3, 10), i % 2 ? '#ffffff' : '#c08457', -1.25 + i * 0.5, y + 0.12, 0.25));
      else if (S.goods === 'crate') s.add(mesh(rbox(0.4, 0.3, 0.36, 0.04), pick(['#c8a165', '#ff922b', '#69db7c', '#e03131']), -1.25 + i * 0.5, y + 0.12, 0.25));
      else s.add(mesh(rbox(0.38, rand(0.28, 0.42), 0.36, 0.05), c, -1.25 + i * 0.5, y + 0.12, 0.25));
    }
  };
  shelf(-24.5, 3.5); shelf(-24.5, 6.6); shelf(-20.6, 3.5); shelf(-20.6, 6.6);
  if (S.goods === 'coffee') for (const [x, z] of [[-24.6, 10.3], [-21.6, 10.3]]) add(mesh(cyl(0.6, 0.6, 0.08, 16), '#ffffff', x, 0.95, z), mesh(cyl(0.08, 0.08, 0.85, 8), '#888', x, 0.5, z), mesh(rbox(0.5, 0.5, 0.5, 0.15), '#9c6ade', x + 0.9, 0.45, z));
  else add(mesh(rbox(1.2, 1.1, 1.2, 0.1), '#ffd43b', -25.8, 0.65, 10.6));
  add(mesh(rbox(5.2, 1.05, 0.9, 0.12), '#ffffff', -15.6, 0.62, 9.6), mesh(rbox(5.4, 0.12, 1.1, 0.05), S.counter, -15.6, 1.2, 9.6));
  for (const x of [-17.2, -15.6, -14]) add(mesh(rbox(0.5, 0.35, 0.05, 0.03), '#2b2433', x, 1.45, 9.4));

  // Manager's office (a little kiosk next to the path)
  const O = L.OFFICE, office = add(new THREE.Group()); office.position.set(O.x, 0, O.z);
  office.add(mesh(box(3.6, 0.2, 3.2), '#e9e4f2', 0, 0.1, 0));
  office.add(mesh(box(0.3, 2.4, 3.2), '#ffffff', -1.65, 1.2, 0), mesh(box(3.6, 2.4, 0.3), '#ffffff', 0, 1.2, -1.45));
  office.add(mesh(rbox(4, 0.3, 3.6, 0.1), th.office.color, 0, 2.55, 0));
  office.add(mesh(rbox(1.8, 0.8, 0.8, 0.08), '#8d6e63', 0.2, 0.5, -0.4), mesh(rbox(0.5, 0.35, 0.05, 0.03), '#2b2433', 0.2, 1.1, -0.55));
  const os = signBoard('💼 MANAGER', 2.6, 0.6, th.office.color); os.position.set(0, 3.15, 1.5); office.add(os);

  // ---- locks (unbuilt buildings)
  const penBLock = add(new THREE.Group()); penBLock.position.set(8.1, 0, -7.6);
  penBLock.add(mesh(rbox(6.8, 1.4, 4, 0.2), '#d9d2e3', 0, 0.7, 0, { transparent: true, opacity: 0.85 }));
  const pbl = textSprite(`🔒 ${th.penB.name}`, 0.9, { size: 56, bg: '#2b2433dd' }); pbl.position.set(0, 2.2, 0); penBLock.add(pbl);
  const shopLock = add(new THREE.Group()); shopLock.position.set(-19.5, 0, 6.2);
  shopLock.add(mesh(rbox(15, 2.6, 11.5, 0.2), '#e7e1ee', 0, 1.3, 0, { transparent: true, opacity: 0.92 }));
  const shl = textSprite(`🔒 ${S.name}`, 1.2, { size: 60, bg: '#2b2433dd' }); shl.position.set(0, 3.8, 0); shopLock.add(shl);
  const sale = signBoard('FOR SALE', 3, 0.9, '#e03131'); sale.position.set(0, 2.65, 5.8); shopLock.add(sale);

  // ---- clouds
  for (let i = 0; i < 9; i++) { const c = cloud(); c.position.set(rand(-110, 110), rand(22, 34), rand(-150, -75)); c.scale.setScalar(rand(1.6, 2.6)); add(c); clouds.push({ c, v: rand(0.8, 1.8) }); }

  // ---- hit boxes so clicking a building opens its panel
  const hit = (key, x, z, w, d, h = 3) => { const m = add(new THREE.Mesh(box(w, h, d), new THREE.MeshBasicMaterial({ visible: false }))); m.position.set(x, h / 2, z); m.userData.station = key; clickables.push(m); };
  hit('parking', (LOT.x0 + LOT.x1) / 2, (LOT.z0 + LOT.z1) / 2, LOT.x1 - LOT.x0, LOT.z1 - LOT.z0, 2);
  hit('parking', -9.6, -15.2, 1.6, 1.6, 5); hit('parking', -34, -15, 6.5, 1.5, 7);
  hit('penA', -0.7, -7.5, 9.6, 4.4); hit('penB', 8.1, -7.5, 7.4, 4.4); hit('desk', 6.2, 2.4, 9, 2.4);
  hit('shop', -19.5, 6.2, 15, 11.5, 3.5); hit('office', O.x, O.z, 3.8, 3.4, 3.4);

  const anchors = { parking: V(-18.5, -10, 4.2), penA: V(-0.7, -7.5, 4.3), penB: V(8.1, -7.5, 4.3), desk: V(6.2, 2, 3.8), shop: V(-19.5, 6.2, 5.2), office: V(O.x, O.z, 4.6) };

  return {
    group: g, clickables, anchors, slotStops, parkSign, billboard,
    setLocked(key, locked) { if (key === 'penB') penBLock.visible = locked; if (key === 'shop') shopLock.visible = locked; },
    update(dt, t) {
      for (const s of swayers) s.userData.crown.rotation.z = Math.sin(t * 1.3 + s.userData.phase) * 0.035;
      for (const c of clouds) { c.c.position.x += c.v * dt; if (c.c.position.x > 110) c.c.position.x = -110; }
    },
    dispose() { scene.remove(g); g.traverse((o) => { if (o.material?.map && o.material.map !== null && o.material.map.isCanvasTexture) o.material.map.dispose(); }); },
  };
}
