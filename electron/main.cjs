/**
 * electron/main.cjs — ErgoKit on-prem desktop shell
 *
 * Design goals for the ITAR / air-gapped target:
 *   1. No bundled web server and no listening port. The built SPA is served
 *      from inside the asar via a custom `app://` protocol (root-absolute paths
 *      like /mediapipe/wasm resolve correctly, and the wouter client router
 *      works because every unknown path falls back to index.html).
 *   2. Hard network egress block. Any request whose scheme is not `app:` (plus
 *      devtools in dev) is cancelled at the session level — defense in depth so
 *      a stray CDN reference can never reach the network.
 *   3. Camera access granted only to the app origin; everything else denied.
 *   4. contextIsolation on, nodeIntegration off, sandbox on.
 */
const { app, BrowserWindow, protocol, session, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
// In production the built client lives at dist/public (vite build output),
// packaged inside the asar next to this file.
const APP_ROOT = isDev
  ? path.resolve(__dirname, '..', 'dist', 'public')
  : path.join(__dirname, 'public');

const APP_SCHEME = 'app';

// Must run before app `ready`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,        // required so MediaPipe can stream the .wasm/.task
      corsEnabled: true,
    },
  },
]);

function resolveRequestPath(reqUrl) {
  // app://app/<path>  →  APP_ROOT/<path>
  const u = new URL(reqUrl);
  let p = decodeURIComponent(u.pathname);
  if (p === '/' || p === '') p = '/index.html';
  // Block path traversal.
  const full = path.normalize(path.join(APP_ROOT, p));
  if (!full.startsWith(APP_ROOT)) return path.join(APP_ROOT, 'index.html');
  return full;
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveRequestPath(request.url);
    // SPA fallback: if the file has no extension (a client route) serve index.html.
    const hasExt = path.extname(filePath) !== '';
    const target = hasExt ? filePath : path.join(APP_ROOT, 'index.html');
    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      return await net.fetch(pathToFileURL(path.join(APP_ROOT, 'index.html')).toString());
    }
  });
}

function lockDownNetwork(sess) {
  // Cancel anything that is not our own app scheme. blob:/data: are allowed
  // (used for in-memory video frames and generated PDFs); devtools only in dev.
  const ALLOW = isDev
    ? ['app:', 'blob:', 'data:', 'devtools:', 'chrome-extension:', 'ws:', 'http://localhost']
    : ['app:', 'blob:', 'data:'];
  sess.webRequest.onBeforeRequest((details, cb) => {
    const ok = ALLOW.some((a) => details.url.startsWith(a));
    if (!ok) {
      console.warn('[egress-blocked]', details.url);
      cb({ cancel: true });
      return;
    }
    cb({ cancel: false });
  });

  // Camera permission only; deny geolocation, notifications, etc.
  sess.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  sess.setPermissionCheckHandler((_wc, permission) => permission === 'media');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b0f17',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No remote content ever.
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(`${APP_SCHEME}://app/index.html`);

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

app.whenReady().then(() => {
  registerAppProtocol();
  lockDownNetwork(session.defaultSession);

  // Belt-and-suspenders CSP — no remote origins permitted.
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' app:; " +
          "script-src 'self' app: 'wasm-unsafe-eval'; " +
          "style-src 'self' app: 'unsafe-inline'; " +
          "img-src 'self' app: blob: data:; " +
          "media-src 'self' app: blob: data:; " +
          "connect-src 'self' app: blob: data:; " +
          "worker-src 'self' app: blob:; " +
          "font-src 'self' app: data:;",
        ],
      },
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Refuse any attempt to open external URLs or new windows.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`)) e.preventDefault();
  });
});
