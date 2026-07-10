/**
 * electron-builder afterPack hook.
 * - chmod +x Piper binary
 * - ad-hoc codesign on macOS so Gatekeeper does not kill unsigned arm64 binaries
 * - ensure models directory is present under resources/piper
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName; // darwin | win32 | linux
  const resources =
    platform === 'darwin'
      ? path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');

  const piperRoot = path.join(resources, 'piper');
  console.log('[afterPack] platform=', platform, 'piperRoot=', piperRoot);

  if (!fs.existsSync(piperRoot)) {
    console.warn('[afterPack] resources/piper missing — models/binary may not be bundled');
    return;
  }

  const candidates = [
    path.join(piperRoot, 'piper'),
    path.join(piperRoot, 'piper.exe'),
    path.join(piperRoot, 'piper', 'piper'),
    path.join(piperRoot, 'piper', 'piper.exe'),
  ];
  for (const bin of candidates) {
    if (!fs.existsSync(bin)) continue;
    try {
      fs.chmodSync(bin, 0o755);
      console.log('[afterPack] chmod +x', bin);
    } catch (e) {
      console.warn('[afterPack] chmod failed', bin, e.message);
    }
    if (platform === 'darwin') {
      try {
        execSync(`codesign --force --sign - "${bin}"`, { stdio: 'inherit' });
        console.log('[afterPack] ad-hoc codesign', bin);
      } catch (e) {
        console.warn('[afterPack] codesign failed', e.message);
      }
    }
  }

  // Make shared libs executable/signable on macOS
  if (platform === 'darwin') {
    for (const f of walk(piperRoot)) {
      if (/\.(dylib|so)$/i.test(f) || /piper$/i.test(path.basename(f))) {
        try {
          fs.chmodSync(f, 0o755);
          execSync(`codesign --force --sign - "${f}"`, { stdio: 'pipe' });
        } catch {
          /* best effort */
        }
      }
    }
  }

  const models = path.join(piperRoot, 'models');
  if (fs.existsSync(models)) {
    const onnx = fs.readdirSync(models).filter((n) => n.endsWith('.onnx'));
    console.log('[afterPack] bundled models:', onnx.join(', ') || '(none)');
  }
};
