/**
 * electron/preload.cjs
 *
 * Minimal, locked-down bridge. The web app is fully client-side and needs no
 * privileged APIs, so we expose only inert metadata. Keeping this surface tiny
 * is part of the ITAR hardening — no fs, no shell, no IPC to Node.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ergokit', {
  platform: process.platform,
  isDesktop: true,
  // Bumped manually on release; surfaced in the UI footer/about if desired.
  shellVersion: '1.0.0',
});
