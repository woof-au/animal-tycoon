// Talks to the desktop app (window.woof, from preload.js): Woof Services sign-in, cloud saves, invites,
// rewards and updates. When opened in a plain browser (development), a local stand-in keeps everything working.

const real = window.woof || null;

const dev = {
  info: async () => ({ version: 'dev', platform: 'windows', dev: true }),
  auth: {
    status: async () => ({ signedIn: localStorage.getItem('dev-signed') === '1', name: 'Tester' }),
    start: async () => ({ code: 'DEV1-TEST', url: '#' }),
    wait: async () => { await new Promise((r) => setTimeout(r, 1200)); localStorage.setItem('dev-signed', '1'); return { status: 'approved', name: 'Tester' }; },
    cancel: async () => {},
    signOut: async () => { localStorage.removeItem('dev-signed'); },
  },
  cloud: {
    session: async () => {
      const raw = localStorage.getItem('dev-save');
      return { ok: true, name: 'Tester', save: raw ? JSON.parse(raw) : null, revision: Number(localStorage.getItem('dev-rev') || 0),
        invite: { code: 'DEVCODE1', url: 'https://woof-services.stream/tycoon/invite/DEVCODE1', friends: 0 }, rewards: [] };
    },
    sync: async ({ data, baseRevision }) => {
      const rev = Number(localStorage.getItem('dev-rev') || 0);
      if (data) { if (baseRevision !== rev) return { ok: false, conflict: true, save: JSON.parse(localStorage.getItem('dev-save')), revision: rev }; localStorage.setItem('dev-save', JSON.stringify(data)); localStorage.setItem('dev-rev', String(rev + 1)); return { ok: true, revision: rev + 1, rewards: [] }; }
      return { ok: true, revision: rev, rewards: [] };
    },
    claim: async (ids) => ({ ok: true, claimed: ids }),
  },
  open: (url) => window.open(url, '_blank'),
  copy: async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } },
  onUpdate: () => {},
  restartToUpdate: () => {},
  quitReady: () => {},
  onQuit: () => {},
};

export const bridge = real || dev;
export const isDev = !real;
