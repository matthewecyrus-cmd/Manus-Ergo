#!/usr/bin/env node
/**
 * vendor-mediapipe.mjs
 *
 * One-time (per dependency bump) vendoring of all MediaPipe runtime assets into
 * client/public/mediapipe/ so the app loads them locally with ZERO network at
 * runtime. Run this on a build machine that DOES have internet; the resulting
 * assets are committed/shipped inside the Electron bundle for the air-gapped
 * ITAR target.
 *
 *   node scripts/vendor-mediapipe.mjs
 *
 * After running, client/public/mediapipe/ contains:
 *   wasm/                       (copied from node_modules/@mediapipe/tasks-vision)
 *   models/pose_landmarker_lite.task   (live scan)
 *   models/pose_landmarker_full.task   (video upload)
 *
 * Vite copies client/public/** verbatim into the build output, so the absolute
 * paths /mediapipe/wasm and /mediapipe/models/*.task resolve at runtime.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, cp, access, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'client/public/mediapipe');

// Keep this version pinned to the @mediapipe/tasks-vision version in package.json.
const WASM_SRC = resolve(ROOT, 'node_modules/@mediapipe/tasks-vision/wasm');

const MODELS = [
  {
    name: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
  {
    name: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function vendorWasm() {
  if (!(await exists(WASM_SRC))) {
    throw new Error(
      `WASM source not found at ${WASM_SRC}.\n` +
      `Run "pnpm install" first so @mediapipe/tasks-vision is present.`
    );
  }
  const dest = resolve(OUT, 'wasm');
  await mkdir(dest, { recursive: true });
  await cp(WASM_SRC, dest, { recursive: true });
  console.log(`✓ WASM runtime  → ${dest}`);
}

async function download(url, destPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  await mkdir(dirname(destPath), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  const { size } = await stat(destPath);
  console.log(`✓ ${destPath.split('/').slice(-1)[0].padEnd(28)} → ${(size / 1e6).toFixed(1)} MB`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await vendorWasm();
  for (const m of MODELS) {
    await download(m.url, resolve(OUT, 'models', m.name));
  }
  console.log('\nAll MediaPipe assets vendored. The app now loads them with no network.');
}

main().catch((err) => {
  console.error('\n✗ vendor-mediapipe failed:', err.message);
  process.exit(1);
});
