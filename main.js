// DeepSeek Harness — macOS desktop shell (Electron main process)
//
// This is a thin shell around the existing `dsh web` runtime. It:
//   1. boots the bundled Harness Runtime as a child Node process
//      (Electron's own Node, via ELECTRON_RUN_AS_NODE — no system Node needed),
//   2. waits until the local server is ready,
//   3. opens a native window pointing at the existing React Web UI,
//   4. tears the whole process tree down on quit so nothing is left behind.
//
// The original `dsh web` runtime and Web UI are reused verbatim.

'use strict';

const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const APP_NAME = 'DeepSeek Harness';
const DEV = process.env.DSH_DESKTOP_DEV === '1' || process.argv.includes('--dev');
const SMOKE = process.argv.includes('--smoke');
// First boot heals the profile symlink fallback and warms the tree, so be generous.
const STARTUP_TIMEOUT_MS = 90_000;
const GRACEFUL_KILL_MS = 3_000;

let backend = null; // the dsh child process
let backendUrl = null;
let win = null;
let quitting = false;
let logStream = null;

function log(...args) {
  const line = `[dsh-desktop] ${args.map(String).join(' ')}\n`;
  if (DEV || SMOKE) process.stdout.write(line);
  if (logStream) logStream.write(line);
}

function dshBinPath() {
  // app.getAppPath(): project root in dev, Contents/Resources/app when packaged.
  return path.join(
    app.getAppPath(),
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'lib',
    'bin.js'
  );
}

// Reuse the same home the CLI/web version uses (~/.dsh) so the desktop app
// shares sessions, settings, credentials and history with `dsh web` and none
// of it lives in a temporary directory. An explicit DSH_HOME still wins.
function resolveDshHome() {
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim()) return process.env.DSH_HOME;
  return path.join(os.homedir(), '.dsh');
}

function showError(title, detail) {
  log('ERROR', title, detail);
  try {
    dialog.showMessageBoxSync({
      type: 'error',
      title,
      message: title,
      detail,
      buttons: ['Quit'],
    });
  } catch (e) {
    /* ignore dialog failures in headless contexts */
  }
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const bin = dshBinPath();
    if (!fs.existsSync(bin)) {
      reject(new Error(`Harness runtime not found at: ${bin}`));
      return;
    }

    log('starting backend:', bin);
    const child = spawn(process.execPath, [bin, 'web', '--port', '0'], {
      cwd: os.homedir(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: resolveDshHome(),
      },
      // own process group so we can terminate the whole tree (bash, pty, agents)
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backend = child;

    let settled = false;
    let buffer = '';

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const timer = setTimeout(() => {
      fail(new Error(`Harness runtime did not become ready within ${STARTUP_TIMEOUT_MS / 1000}s.`));
    }, STARTUP_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      logStream && logStream.write(chunk);
      const m = buffer.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        backendUrl = m[1];
        log('backend ready at', backendUrl);
        resolve(backendUrl);
      }
    });

    child.stderr.on('data', (chunk) => {
      logStream && logStream.write(chunk);
      if (DEV || SMOKE) process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      fail(new Error(`Failed to start Harness runtime: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      backend = null;
      if (!settled) {
        fail(new Error(`Harness runtime exited before ready (code=${code}, signal=${signal}).`));
      } else if (!quitting) {
        showError(
          'DeepSeek Harness stopped unexpectedly',
          `The Harness runtime exited (code=${code}, signal=${signal}).\n\n` +
            'Please check the log for details, then relaunch the app.'
        );
        app.quit();
      }
    });
  });
}

function stopBackend() {
  const child = backend;
  backend = null;
  if (!child) return;
  const pid = child.pid;
  log('stopping backend (pid', pid + ')');
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  // Hard-kill the group if it ignores SIGTERM. NOT unref'd: this is a
  // best-effort cleanup we want to survive even if the parent is exiting.
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }, GRACEFUL_KILL_MS);
}

// Single exit path that always tears the runtime down first. `app.exit()`
// bypasses the before-quit event, so every exit must go through here.
function quit(code = 0) {
  if (quitting) return;
  quitting = true;
  stopBackend();
  app.exit(code);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      // The Web UI is a plain SPA that talks to the local server over
      // HTTP + WebSocket, so the renderer needs no Node access.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (!SMOKE) {
    win.once('ready-to-show', () => win.show());
  }

  // Open target=_blank / window.open links in the user's real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (event, code, desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || code === -3 || quitting) return; // -3 = aborted
    log('did-fail-load', code, desc, validatedURL);
  });

  win.on('closed', () => {
    win = null;
  });

  win.loadURL(url);
}

async function smokeTest(url) {
  // Verify the backend actually serves the UI (not just that the socket opened).
  const res = await fetch(url);
  const html = await res.text();
  if (res.status !== 200 || !html.includes('__DSH_BOOT__')) {
    throw new Error(`smoke: unexpected backend response (status=${res.status}, has boot=${html.includes('__DSH_BOOT__')})`);
  }
  createWindow(url);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('smoke: window did not finish loading')), 30_000);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(t);
      resolve();
    });
    win.webContents.once('did-fail-load', (e, code, desc) => {
      clearTimeout(t);
      reject(new Error(`smoke: window load failed (code=${code}, ${desc})`));
    });
  });
  log('SMOKE_OK', url);
  quit(0);
}

async function run() {
  await app.whenReady();
  buildMenu();

  // Keep all runtime logs in a proper per-app Logs directory.
  const logDir = app.getPath('logs');
  fs.mkdirSync(logDir, { recursive: true });
  logStream = fs.createWriteStream(path.join(logDir, 'dsh-backend.log'), { flags: 'a' });
  log(`app ready (dsh home: ${resolveDshHome()})`);

  try {
    const url = await startBackend();
    if (SMOKE) {
      await smokeTest(url);
      return;
    }
    createWindow(url);
  } catch (err) {
    showError(
      'DeepSeek Harness could not start',
      `${err.message}\n\nPlease check:\n` +
        '- the Harness runtime installation\n' +
        '- the log at ' + path.join(logDir, 'dsh-backend.log') + '\n' +
        '- your DeepSeek API configuration'
    );
    quit(1);
  }
}

// ---- lifecycle -------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.on('before-quit', () => {
    quitting = true;
    stopBackend();
  });

  app.on('window-all-closed', () => {
    // Closing the window quits the whole app — and therefore the runtime.
    app.quit();
  });

  app.on('activate', () => {
    if (win === null && backendUrl) createWindow(backendUrl);
  });

  run().catch((err) => {
    showError('DeepSeek Harness failed to start', err && err.stack ? err.stack : String(err));
    quit(1);
  });

  // Last-resort safety net: if the process dies without a clean quit (uncaught
  // exception, etc.), still try to terminate the backend synchronously.
  process.on('exit', () => {
    if (!backend) return;
    try {
      process.kill(-backend.pid, 'SIGTERM');
    } catch {
      try {
        backend.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  });
}
