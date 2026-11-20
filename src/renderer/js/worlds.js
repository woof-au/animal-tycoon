// The three worlds: their look, their animals and their economy. Every world uses the same layout but is
// themed differently, and each one is worth far more than the last (mult). Complete a world to unlock the next.

export const WORLDS = [
  {
    id: 1, name: 'Dog Pound', tagline: 'Find every pup a forever home.', mult: 1, startMoney: 60,
    sky: '#9fd8ff', fog: '#bfe6ff', grass: '#8fd16a', patches: ['#9ad873', '#84c75f', '#a3dd7d'], trees: ['#4fae4a', '#5cbf55', '#3e9e45', '#6ccb5f'],
    main: { sign: '🐾 ADOPTION CENTRE', trim: '#ff7a45', wall: '#fbf6ee', floor: ['#f6ead6', '#efdcbf'] },
    penA: { name: 'Puppy Kennels', sign: 'PUPPIES', animal: 'dog', size: 0.62, straw: '#ecd593', color: '#4dabf7', word: 'puppy', staff: 'Carers' },
    penB: { name: 'Big Dog Kennels', sign: 'BIG DOGS', animal: 'dog', size: 1.05, straw: '#e3c97d', color: '#9c6ade', word: 'dog', staff: 'Carers' },
    desk: { name: 'Adoption Desk', sign: 'ADOPTIONS', color: '#2fbf71' },
    shop: { name: 'Pet Supply Shop', sign: '🦴 PET SUPPLIES', trim: '#36a3f7', wall: '#fbfbff', floor: ['#e6f2fb', '#d6e9f7'], goods: 'basket', counter: '#36a3f7' },
    office: { name: "Manager's Office", color: '#ffb020' },
    billboard: 'ADOPT A BEST FRIEND 🐶', billboardColor: '#ff7a45', yard: 'PLAY YARD', yardAnimal: 'dog', yardGround: '#a8e07f',
  },
  {
    id: 2, name: 'Cat Rescue', tagline: 'Purr-fect homes for every kitty.', mult: 45, hard: 1.2, startMoney: 2700,
    sky: '#ffd6ec', fog: '#ffe6f3', grass: '#9fd67a', patches: ['#b5e08f', '#93cf6c', '#c3e8a3'], trees: ['#f7a1c4', '#ffb3d1', '#e78fb3', '#6ccb5f'],
    main: { sign: '🐱 CAT RESCUE', trim: '#e64980', wall: '#fff7fb', floor: ['#fde7f1', '#f6d4e4'] },
    penA: { name: 'Kitten Room', sign: 'KITTENS', animal: 'cat', size: 0.75, straw: '#f3d9ef', color: '#f783ac', word: 'kitten', staff: 'Carers' },
    penB: { name: 'Cat Lounge', sign: 'CAT LOUNGE', animal: 'cat', size: 1.05, straw: '#e9cde6', color: '#845ef7', word: 'cat', staff: 'Carers' },
    desk: { name: 'Adoption Desk', sign: 'ADOPTIONS', color: '#e64980' },
    shop: { name: 'Cat Café', sign: '☕ CAT CAFÉ', trim: '#9c6ade', wall: '#fbf8ff', floor: ['#efe5fb', '#e3d5f7'], goods: 'coffee', counter: '#9c6ade' },
    office: { name: "Manager's Office", color: '#e64980' },
    billboard: 'MEET YOUR NEW CAT 🐱', billboardColor: '#e64980', yard: 'CAT GARDEN', yardAnimal: 'cat', yardGround: '#c3e8a3',
  },
  {
    id: 3, name: 'Farm Sanctuary', tagline: 'Bunnies, ponies and big open fields.', mult: 2000, hard: 1.4, startMoney: 120000,
    sky: '#ffe2b0', fog: '#ffeccc', grass: '#a6cf5c', patches: ['#b7da6e', '#96c24f', '#c4e085'], trees: ['#e8a33d', '#d9822b', '#7cb342', '#c0ca33'],
    main: { sign: '🐴 FARM SANCTUARY', trim: '#c0392b', wall: '#fbf3e6', floor: ['#efe3c8', '#e5d4b0'] },
    penA: { name: 'Bunny Barn', sign: 'BUNNIES', animal: 'bunny', size: 1.1, straw: '#e9d38f', color: '#ffa94d', word: 'bunny', staff: 'Farmhands' },
    penB: { name: 'Pony Paddock', sign: 'PONIES', animal: 'pony', size: 0.92, straw: '#d9c27a', color: '#a0522d', word: 'pony', staff: 'Farmhands' },
    desk: { name: 'Adoption Desk', sign: 'ADOPTIONS', color: '#2f9e44' },
    shop: { name: 'Farm Shop', sign: '🌽 FARM SHOP', trim: '#2f9e44', wall: '#fbfaf2', floor: ['#eef3df', '#e2ebcc'], goods: 'crate', counter: '#2f9e44' },
    office: { name: "Manager's Office", color: '#c0392b' },
    billboard: 'ADOPT A FARM FRIEND 🐰', billboardColor: '#2f9e44', yard: 'PADDOCK', yardAnimal: 'pony', yardGround: '#bcdc7a',
  },
];

const geo = (base, g) => (l) => Math.round(base * g ** (l - 1));
const flat = (arr) => (l) => Math.round(arr[l - 1]);
const COST = 0.55;
const fmtSec = (s) => `${s.toFixed(1)}s`;

/** The upgrade tree for one world. Values and costs scale by the world's multiplier. */
export function economy(w, fmt) {
  // Later worlds cost a little more relative to what they pay, so each one takes longer than the last.
  const M = w.mult, c = (n) => n * M * COST * (w.hard || 1);
  return {
    parking: { name: 'Parking Lot', icon: '🚗', desc: 'More spaces and bigger ads bring more families.', tracks: {
      slots: { label: 'Parking spaces', max: 6, cost: geo(c(45), 1.85), val: (l) => l + 2, show: (v) => `${v} spaces` },
      ads: { label: 'Billboard ads', max: 12, cost: geo(c(60), 1.62), val: (l) => +(5.5 * 0.88 ** (l - 1)).toFixed(1), show: (v) => `a car every ${v}s` },
    } },
    penA: { name: w.penA.name, icon: w.id === 1 ? '🐶' : w.id === 2 ? '🐱' : '🐰', desc: `Families meet the ${w.penA.word === 'bunny' ? 'bunnies' : `${w.penA.word}s`} here.`, tracks: {
      fee: { label: 'Adoption fee', max: 30, cost: geo(c(18), 1.26), val: (l) => Math.round(16 * M * 1.19 ** (l - 1)), show: (v) => `${fmt(v)} per ${w.penA.word}` },
      staff: { label: w.penA.staff, max: 3, cost: flat([c(110), c(420)]), val: (l) => l, show: (v) => `${v} working` },
      speed: { label: 'Care speed', max: 12, cost: geo(c(80), 1.5), val: (l) => 1 + 0.22 * (l - 1), show: (v) => `${fmtSec(5.5 / v)} per family` },
    } },
    penB: { name: w.penB.name, icon: w.id === 1 ? '🐕' : w.id === 2 ? '🐈' : '🐴', desc: 'Bigger animals, bigger adoption fees.', unlock: c(520), tracks: {
      fee: { label: 'Adoption fee', max: 30, cost: geo(c(110), 1.26), val: (l) => Math.round(48 * M * 1.19 ** (l - 1)), show: (v) => `${fmt(v)} per ${w.penB.word}` },
      staff: { label: w.penB.staff, max: 3, cost: flat([c(380), c(1300)]), val: (l) => l, show: (v) => `${v} working` },
      speed: { label: 'Care speed', max: 12, cost: geo(c(240), 1.5), val: (l) => 1 + 0.22 * (l - 1), show: (v) => `${fmtSec(6.5 / v)} per family` },
    } },
    desk: { name: w.desk.name, icon: '📋', desc: 'Every adoption is paid here. Long queues make families leave!', tracks: {
      staff: { label: 'Clerks', max: 3, cost: flat([c(160), c(650)]), val: (l) => l, show: (v) => `${v} clerk${v > 1 ? 's' : ''}` },
      speed: { label: 'Paperwork speed', max: 12, cost: geo(c(110), 1.5), val: (l) => 1 + 0.27 * (l - 1), show: (v) => `${fmtSec(4.5 / v)} per family` },
      comfort: { label: 'Comfy waiting area', max: 6, cost: geo(c(150), 1.9), val: (l) => 26 + 8 * (l - 1), show: (v) => `families wait ${v}s` },
    } },
    shop: { name: w.shop.name, icon: w.id === 1 ? '🦴' : w.id === 2 ? '☕' : '🌽', desc: 'New owners stop by on the way home.', unlock: c(1250), tracks: {
      price: { label: 'Product range', max: 30, cost: geo(c(160), 1.26), val: (l) => Math.round(28 * M * 1.19 ** (l - 1)), show: (v) => `${fmt(v)} per visit` },
      staff: { label: 'Cashiers', max: 3, cost: flat([c(500), c(1600)]), val: (l) => l, show: (v) => `${v} cashier${v > 1 ? 's' : ''}` },
      speed: { label: 'Checkout speed', max: 12, cost: geo(c(260), 1.5), val: (l) => 1 + 0.27 * (l - 1), show: (v) => `${fmtSec(3.5 / v)} per visit` },
      appeal: { label: 'Window displays', max: 6, cost: geo(c(300), 1.9), val: (l) => 0.55 + 0.08 * (l - 1), show: (v) => `${Math.round(v * 100)}% of families visit` },
    } },
    office: { name: w.office.name, icon: '💼', desc: 'Your manager multiplies every sale in this world.', tracks: {
      boost: { label: 'Profit multiplier', max: 12, cost: geo(c(500), 1.72), val: (l) => +(1 + 0.25 * (l - 1)).toFixed(2), show: (v) => `×${v} on everything` },
      vip: { label: 'VIP visits', max: 6, cost: geo(c(400), 1.9), val: (l) => 70 - 8 * (l - 1), show: (v) => `a VIP every ~${v}s` },
    } },
  };
}
export const ORDER = ['parking', 'penA', 'penB', 'desk', 'shop', 'office'];

/** A fresh save for one world. */
export function newWorldState(w, cfg) {
  const lv = {};
  for (const k of ORDER) { lv[k] = {}; for (const t in cfg[k].tracks) lv[k][t] = 1; }
  return { money: w.startMoney, earned: 0, lv, unlocked: { parking: true, penA: true, desk: true, office: true, penB: false, shop: false }, done: false };
}

/** The invite bonus for a world: roughly a sixth of everything the world costs to max (about $730K × mult × hard). */
export function inviteBonus(w) { return Math.round(120000 * w.mult * (w.hard || 1)); }
