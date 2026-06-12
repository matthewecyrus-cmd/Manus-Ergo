# ErgoKit — On-Prem / ITAR Desktop Build

Single-camera ergonomic assessment, packaged as an offline Windows desktop app.
No SaaS, no cloud, no network at runtime. Scoring is the validated Pose2Sim
RULA/REBA engine (see "Engine" below).

## One-time build-machine setup (needs internet)

```bash
pnpm install
pnpm run vendor:all     # vendor:mediapipe + vendor:fonts
```

`vendor:all` is the ONLY step that touches the network:
- `vendor:mediapipe` → WASM runtime + pose models into `client/public/mediapipe/`
- `vendor:fonts` → Barlow Condensed + DM Sans woff2 into `client/public/fonts/`

After it runs, every asset the app needs lives inside the repo and ships in the
bundle. The Manus-private dev plugins are `optionalDependencies`, so `pnpm install`
succeeds even on a machine that can't reach the Manus registry.

## Build the Windows app (no internet needed once vendored)

```bash
pnpm run dist:win
# runs: vite build  →  verify:offline GATE  →  electron-builder
# → release/ErgoKit-Setup-<version>.exe        (NSIS per-user installer)
# → release/ErgoKit-<version>-portable.exe      (single-file portable)
```

`dist:win` will NOT package if the air-gap gate finds a forbidden reference — the
build halts before electron-builder runs. For a full from-scratch one-shot
(re-vendor + build + gate + package) use `pnpm run dist:onprem`.

Copy either `.exe` to the air-gapped machine. The portable build needs no install
rights and leaves no services running.

## The air-gap gate (`pnpm run verify:offline`)

`scripts/verify-offline.mjs` scans `dist/public` after every build and FAILS
(non-zero exit) if any real network/telemetry reference is present
(`fonts.googleapis`, `cdn.*`, `storage.googleapis`, `*.manus.*`, `forge.*`,
analytics hosts, etc.). It is wired into `dist:win`/`dist:onprem` so a leaky
build can't be packaged.

It separately lists **inert** `http(s)://` strings (library license/homepage/spec
URLs that are never fetched) as "review" items — currently ~74, all from bundled
open-source libs (github.com, MDN, IETF/Khronos specs in the emscripten WASM
runtime, jsPDF/html2canvas homepages). These are accepted, not network calls. Two
are explicitly allowlisted with justification in the script:
- `type.googleapis.com/…` — protobuf type identifiers, never fetched.
- `cdnjs…/pdfobject…` — only used by jsPDF `output('pdfobjectnewwindow')`, which
  ErgoKit never calls (it uses `doc.save()`); also unreachable behind the egress block.

Run `pnpm run verify:offline -- --strict` to additionally fail on those inert URLs.

## Why this is air-gap safe

| Concern | Handling |
|---|---|
| MediaPipe WASM + models | Vendored to `client/public/mediapipe/`, loaded via `/mediapipe/...` |
| Fonts | Self-hosted from `client/public/fonts/` via local `@font-face` — no font CDN |
| Manus build runtime | `vitePluginManusRuntime` / `jsxLocPlugin` dynamically imported **dev-server only**; never imported or required by a production build |
| Debug collector | `client/public/__manus__/` (session-replay script) **deleted** — no longer copied into the build |
| Dead remote component | `client/src/components/Map.tsx` (forge proxy) **deleted** |
| App hosting | Custom `app://` protocol serves the SPA from inside the asar — **no listening port, no Express server** |
| Network egress | `session.webRequest.onBeforeRequest` cancels any non-`app:`/`blob:`/`data:` request in production |
| CSP | `connect-src 'self' app: blob: data:` — no remote origin permitted |
| Permissions | Only `media` (camera) granted; geolocation/notifications denied |
| New windows / navigation | Denied unless `app://` |
| Post-build proof | `verify:offline` gate fails the package on any forbidden reference |

## Engine

`client/src/lib/pose2sim-engine.ts` is the validated RULA/REBA engine, ported
verbatim from `ErgoKit_latest.html`. `ergo-engine.ts`'s `extractAngles` /
`calcRULA` / `calcREBA` are thin adapters over it; scoring runs on MediaPipe
**world** landmarks (the validated path). Fidelity is proven by
`client/src/lib/__tests__/pose2sim-engine.parity.test.ts` (engine-derived golden
vectors). Do not "clean up" the engine math — equivalence to the validated source
is the contract.
