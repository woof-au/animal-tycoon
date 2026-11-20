// electron-builder afterPack hook. Without a paid Apple certificate the Mac app is ad-hoc signed, so macOS treats it
// as an app from an unidentified developer (Open Anyway) instead of "damaged". Only the final universal app is signed:
// signing the per-architecture builds would stop them from being merged.
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || !/universal/i.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`ad-hoc signed ${app}`);
};
