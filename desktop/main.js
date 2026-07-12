/**
 * Resonara desktop shell (Electron).
 * Spawns the local Nest lite backend and opens the product UI.
 * Production uses Electron as Node (ELECTRON_RUN_AS_NODE) so end users need no Node install.
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

function augmentPath(base) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const extras = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.platform === 'win32' ? 'C:\\ffmpeg\\bin' : '',
    process.platform === 'win32' ? 'C:\\Program Files\\ffmpeg\\bin' : '',
  ].filter(Boolean);
  return [...extras, base || ''].filter(Boolean).join(sep);
}


const PORT = process.env.PORT || '3847';
const isDev = !app.isPackaged;

let mainWindow = null;
let serverProc = null;

function repoRoot() {
  if (isDev) return path.join(__dirname, '..');
  return process.resourcesPath;
}

function userDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function startBackend() {
  const root = repoRoot();
  const dataDir = userDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const moduleDirs = [
    path.join(root, 'node_modules'),
    path.join(__dirname, '..', 'node_modules'),
  ].filter((p) => fs.existsSync(p));

  const piperDir = path.join(root, isDev ? 'resources/piper' : 'piper');
  const venvDir = isDev
    ? path.join(root, 'tools', 'piper-venv')
    : path.join(root, 'piper-venv');
  const piperExe = process.platform === 'win32' ? 'piper.exe' : 'piper';
  const venvPiper = path.join(
    venvDir,
    process.platform === 'win32' ? 'Scripts' : 'bin',
    piperExe,
  );
  const piperBin = path.join(piperDir, piperExe);
  const piperNested = path.join(piperDir, 'piper', piperExe);
  // Prefer Python venv (reliable on macOS arm64), then native binary, then env.
  const piperPath = fs.existsSync(venvPiper)
    ? venvPiper
    : fs.existsSync(piperBin)
      ? piperBin
      : fs.existsSync(piperNested)
        ? piperNested
        : process.env.PIPER_PATH || '';
  const piperModels = path.join(piperDir, 'models');

  const env = {
    ...process.env,
    PORT: String(PORT),
    RESONARA_LITE: '1',
    RESONARA_DESKTOP: '1',
    RESONARA_DATA_DIR: dataDir,
    API_PUBLIC_URL: `http://127.0.0.1:${PORT}`,
    PATH: augmentPath(process.env.PATH),
    NODE_PATH: [...moduleDirs, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    PIPER_PATH: piperPath || process.env.PIPER_PATH || '',
    PIPER_MODELS_DIR: fs.existsSync(piperModels)
      ? piperModels
      : process.env.PIPER_MODELS_DIR || '',
    ELECTRON_RESOURCES_PATH: root,
  };

  const entry = path.join(root, 'dist', 'main.js');
  let nodeBin;
  let spawnEnv = env;
  if (process.env.RESONARA_NODE) {
    nodeBin = process.env.RESONARA_NODE;
  } else if (isDev) {
    nodeBin = 'node';
  } else {
    // Packaged: run backend with Electron binary as Node — no system Node required
    nodeBin = process.execPath;
    spawnEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' };
  }

  if (!fs.existsSync(entry)) {
    console.error('Backend entry missing:', entry);
  }

  serverProc = spawn(nodeBin, [entry], {
    cwd: root,
    env: spawnEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout?.on('data', (d) => process.stdout.write(`[resonara-api] ${d}`));
  serverProc.stderr?.on('data', (d) => process.stderr.write(`[resonara-api] ${d}`));
  serverProc.on('exit', (code) => {
    console.log('Backend exited', code);
    serverProc = null;
  });
}

function waitForHealth(timeoutMs = 90000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        `http://127.0.0.1:${PORT}/health`,
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            if (res.statusCode === 200) resolve(body);
            else if (Date.now() - start > timeoutMs)
              reject(new Error('health timeout'));
            else setTimeout(tick, 400);
          });
        },
      );
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('health timeout'));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Resonara',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${PORT}/ui/voice/`);
}

app.whenReady().then(async () => {
  try {
    startBackend();
    await waitForHealth();
    await createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'Resonara failed to start',
      `${err.message}\n\nEnsure ffmpeg is on PATH. Desktop mode uses a local lite engine (no Docker/Node setup).`,
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(console.error);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
  }
});
