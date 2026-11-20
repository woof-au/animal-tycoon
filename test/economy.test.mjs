// Sanity checks for the three worlds' economy (runs in CI before every release).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS, economy, ORDER, newWorldState, inviteBonus } from '../src/renderer/js/worlds.js';

const fmt = (n) => `$${n}`;

test('three worlds, in order, each richer than the last', () => {
  assert.equal(WORLDS.length, 3);
  WORLDS.forEach((w, i) => assert.equal(w.id, i + 1));
  for (let i = 1; i < WORLDS.length; i++) assert.ok(WORLDS[i].mult > WORLDS[i - 1].mult);
});

for (const w of WORLDS) {
  test(`world ${w.id} (${w.name}) economy is consistent`, () => {
    const cfg = economy(w, fmt);
    for (const k of ORDER) {
      assert.ok(cfg[k], `station ${k}`);
      for (const [t, tr] of Object.entries(cfg[k].tracks)) {
        assert.ok(tr.max >= 2, `${k}.${t} max`);
        let prevCost = 0;
        for (let l = 1; l < tr.max; l++) {
          const c = tr.cost(l);
          assert.ok(Number.isFinite(c) && c > 0, `${k}.${t} cost at ${l}`);
          assert.ok(c >= prevCost, `${k}.${t} costs never fall`);
          prevCost = c;
          assert.ok(Number.isFinite(tr.val(l)), `${k}.${t} value at ${l}`);
          assert.equal(typeof tr.show(tr.val(l)), 'string');
        }
      }
    }
    const st = newWorldState(w, cfg);
    assert.equal(st.money, w.startMoney);
    for (const k of ORDER) for (const t in cfg[k].tracks) assert.equal(st.lv[k][t], 1);
    assert.equal(st.unlocked.penB, false);
    assert.equal(st.unlocked.shop, false);
    assert.ok(cfg.shop.unlock > cfg.penB.unlock);
    assert.ok(w.startMoney < cfg.penB.unlock, 'the second pen must be earned');
    assert.ok(inviteBonus(w) > w.startMoney * 10, 'invite bonus feels big');
  });
}
