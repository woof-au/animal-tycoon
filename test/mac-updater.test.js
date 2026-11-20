// The Mac updater reads latest-mac.yml written by electron-builder. Runs without Electron (the module only needs
// `app` at call time, so a stub is enough).
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'electron' ? { app: { getVersion: () => '1.0.0', getPath: () => '/tmp' } } : orig.call(this, req, ...rest); };
const { parseLatestYml } = require('../src/mac-updater');
Module._load = orig;

test('picks the zip from latest-mac.yml', () => {
  const yml = `version: 1.1.0
files:
  - url: Animal-Tycoon-Mac.zip
    sha512: abc123==
    size: 123456
    blockMapSize: 999
  - url: Animal-Tycoon-Mac.dmg
    sha512: def456==
    size: 234567
path: Animal-Tycoon-Mac.zip
sha512: abc123==
releaseDate: '2026-11-20T08:00:00.000Z'
`;
  assert.deepEqual(parseLatestYml(yml), { version: '1.1.0', url: 'Animal-Tycoon-Mac.zip', sha512: 'abc123==', size: 123456 });
});

test('ignores feeds without a zip or version', () => {
  assert.equal(parseLatestYml('version: 1.1.0\nfiles:\n  - url: a.dmg\n    sha512: x\n    size: 1\n'), null);
  assert.equal(parseLatestYml('nothing here'), null);
});
