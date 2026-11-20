// Background music and sound effects, synthesised live with Web Audio (no audio files to download).
// Each world has its own key, tempo and instrument colour. A gentle, happy loop that never repeats exactly.

let ctx = null, master = null, musicBus = null, sfxBus = null, timer = null, step = 0, nextTime = 0;
let musicVol = 0.5, sfxVol = 0.7, song = null;

const SONGS = {
  1: { bpm: 104, root: 60, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'triangle', pad: 'sine', swing: 0.06 },
  2: { bpm: 92, root: 63, prog: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]], lead: 'sine', pad: 'triangle', swing: 0.1 },
  3: { bpm: 112, root: 57, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'square', pad: 'sine', swing: 0.04 },
};
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function ensure() {
  if (ctx) return true;
  try {
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicVol * 0.5; musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(comp);
    return true;
  } catch { return false; }
}

function note(freq, t, dur, { type = 'sine', vol = 0.1, attack = 0.01, release = 0.25, cutoff = 4000, bus = musicBus, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + dur + release + 0.05);
}
function noise(t, dur, vol, hp = 6000) {
  const len = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(musicBus); s.start(t);
}

let melody = 4;
function schedule() {
  const s = song, beat = 60 / s.bpm / 2; // eighth notes
  // Music muted (or the game in the background): create no sound nodes at all, just keep time.
  if (musicVol <= 0 || ctx.state !== 'running') { nextTime = Math.max(nextTime, ctx.currentTime + 0.1); return; }
  while (nextTime < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 8) % s.prog.length, pos = step % 8, chord = s.prog[bar];
    const t = nextTime + (pos % 2 ? s.swing * beat : 0);
    if (pos === 0) { // pad chord + bass on the bar
      for (const iv of chord) note(hz(s.root + iv - 12), t, beat * 7.5, { type: s.pad, vol: 0.035, attack: 0.25, release: 0.6, cutoff: 1400 });
      note(hz(s.root + chord[0] - 24), t, beat * 3, { type: 'sine', vol: 0.12, release: 0.2, cutoff: 600 });
    }
    if (pos === 4) note(hz(s.root + chord[0] - 24 + (Math.random() < 0.5 ? 7 : 12)), t, beat * 2.5, { type: 'sine', vol: 0.09, cutoff: 600 });
    if (pos % 2 === 0) noise(t, 0.05, pos === 4 ? 0.05 : 0.025);
    if (pos === 2 || pos === 6) noise(t, 0.12, 0.03, 2500);
    // Melody: a wandering pentatonic line that leans on chord tones
    if (Math.random() < (pos % 2 ? 0.45 : 0.8)) {
      melody = Math.max(0, Math.min(PENTA.length - 1, melody + Math.round((Math.random() - 0.5) * 3)));
      const m = s.root + 12 + PENTA[melody];
      note(hz(m), t, beat * 0.7, { type: s.lead, vol: s.lead === 'square' ? 0.025 : 0.05, release: 0.18, cutoff: 3000 });
      if (Math.random() < 0.15) note(hz(m + 12), t + beat * 0.5, beat * 0.4, { type: 'sine', vol: 0.025, release: 0.15 });
    }
    nextTime += beat; step++;
  }
}

export const audio = {
  start(world = 1) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    song = SONGS[world] || SONGS[1];
    if (timer) return;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 100); // schedules 250 ms ahead, so a 100 ms tick is plenty
  },
  setWorld(world) { song = SONGS[world] || SONGS[1]; },
  stop() { clearInterval(timer); timer = null; },
  setMusic(v) { musicVol = v; if (musicBus) musicBus.gain.value = v * 0.5; },
  setSfx(v) { sfxVol = v; if (sfxBus) sfxBus.gain.value = v; },
  resume() { if (ctx && ctx.state === 'suspended') { ctx.resume(); nextTime = Math.max(nextTime, ctx.currentTime + 0.1); } },
  pause() { if (ctx && ctx.state === 'running') ctx.suspend(); },
};

function sfxNote(freq, dur, type, vol, slide = 0, delay = 0) {
  if (!ensure() || sfxVol <= 0) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  coin: () => { sfxNote(1320, 0.07, 'triangle', 0.05); sfxNote(1760, 0.1, 'triangle', 0.045, 0, 0.06); },
  buy: () => { sfxNote(660, 0.08, 'square', 0.035); sfxNote(990, 0.12, 'square', 0.035, 0, 0.08); },
  click: () => sfxNote(880, 0.04, 'sine', 0.04),
  unlock: () => [523, 659, 784, 1047].forEach((f, i) => sfxNote(f, 0.2, 'triangle', 0.07, 0, i * 0.11)),
  fanfare: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => sfxNote(f, 0.25, 'triangle', 0.07, 0, i * 0.12)),
  happy: () => { sfxNote(784, 0.08, 'sine', 0.05); sfxNote(1175, 0.12, 'sine', 0.05, 0, 0.08); },
  angry: () => sfxNote(200, 0.25, 'sawtooth', 0.04, 0.5),
  animal(kind) {
    if (kind === 'dog') { sfxNote(420, 0.07, 'sawtooth', 0.035, 0.6); sfxNote(380, 0.07, 'sawtooth', 0.03, 0.6, 0.11); }
    else if (kind === 'cat') sfxNote(700, 0.35, 'triangle', 0.04, 1.5);
    else if (kind === 'pony') { sfxNote(500, 0.12, 'sawtooth', 0.03, 1.4); sfxNote(650, 0.25, 'sawtooth', 0.03, 0.6, 0.12); }
    else sfxNote(1500, 0.06, 'sine', 0.04, 1.3);
  },
};
