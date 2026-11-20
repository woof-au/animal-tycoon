# Animal Tycoon

A free 3D animal-shelter tycoon game for Windows by [Woof Services](https://woof-services.stream/animal-tycoon).

- **Game**: `src/renderer` — three.js, all models built in code, procedural music (Web Audio). No asset downloads.
- **App**: `src/main.js` + `src/preload.js` — Electron window, Woof Services sign-in (device link), cloud saves and auto-updates.
- **Site API**: `woof-services` → `/api/app/tycoon/{session,sync,claim,install}` and `/tycoon/invite/<code>`.

## Release

Bump `version` in `package.json`, commit, then tag and push:

```bash
git tag v1.0.1 && git push origin main v1.0.1
```

GitHub Actions builds `Animal-Tycoon-Setup.exe` and publishes the release with `latest.yml`. Installed games download the
update in the background and install it the next time they start.

## Develop

```bash
npm install
npm test
npm start
```
