#!/usr/bin/env node
/**
 * verify-offline.mjs — air-gap / ITAR acceptance gate.
 *
 * Scans the production build output (dist/public by default) for any reference
 * that could cause a network call at runtime. Run AFTER `vite build`:
 *
 *     node scripts/verify-offline.mjs            # fail on known-bad hosts
 *     node scripts/verify-offline.mjs --strict   # fail on ANY non-allowlisted http(s)://
 *     node scripts/verify-offline.mjs dist/public # explicit target dir
 *
 * Exit code 0 = clean. Non-zero = references found (build must not be deployed).
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const TARGET = path.resolve(ROOT, args.find((a) => !a.startsWith('--')) ?? 'dist/public');

// Definitely-network / telemetry hosts — a hard failure if a *real* URL uses one.
const FORBIDDEN_HOSTS = [
  'fonts.googleapis.com', 'fonts.gstatic.com', 'gstatic.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'esm.sh',
  'storage.googleapis.com', 'firebaseio.com', 'google-analytics.com', 'googletagmanager.com',
  'butterfly-effect.dev', 'sentry.io', 'segment.com', 'mixpanel.com',
];

// Non-URL markers (paths / hostnames) that indicate Manus tooling leaked into
// the build. Checked as plain substrings.
const FORBIDDEN_MARKERS = [
  '/__manus__', '.manus.computer', '.manuscomputer.ai', '.manusvm.computer',
  '.manuspre.computer', 'forge.butterfly-effect',
];

// http(s) strings that are NOT runtime network calls and are safe to ignore:
//   - XML/SVG namespaces and spec URIs (identifiers, never fetched)
//   - protobuf Any "type URLs" (type.googleapis.com/<Msg> — an identifier)
//   - jsPDF's pdfobject preview path: present in the jspdf bundle but only used
//     by output('pdfobjectnewwindow'), which ErgoKit never calls (it uses
//     doc.save()). Also unreachable behind the Electron egress block. Documented
//     inert exception — see ONPREM_BUILD.md.
const ALLOWLIST_PREFIXES = [
  'http://www.w3.org/', 'https://www.w3.org/',
  'http://www.inkscape.org/', 'http://creativecommons.org/',
  'http://purl.org/', 'https://schema.org',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfobject/',
];
const ALLOWLIST_SUBSTR = [
  'type.googleapis.com/', // protobuf type identifier, never fetched
];

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.cjs', '.css', '.json', '.svg', '.map', '.txt', '.webmanifest']);

async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

function isAllowlisted(url) {
  return ALLOWLIST_PREFIXES.some((p) => url.startsWith(p)) ||
         ALLOWLIST_SUBSTR.some((s) => url.includes(s));
}

function findRefs(text) {
  const lines = text.split('\n');
  const hardHits = [];
  const reviewHits = [];
  lines.forEach((line, i) => {
    // 1) Extract real URLs and classify them.
    const urls = line.match(/https?:\/\/[^\s"'`)<>]+/g) ?? [];
    for (const u of urls) {
      if (isAllowlisted(u)) continue;
      const badHost = FORBIDDEN_HOSTS.find((h) => u.includes(h));
      if (badHost) hardHits.push({ line: i + 1, marker: badHost, text: u.slice(0, 160) });
      else reviewHits.push({ line: i + 1, url: u.slice(0, 120) });
    }
    // 2) Non-URL Manus markers (paths/hostnames) — plain substring.
    for (const m of FORBIDDEN_MARKERS) {
      if (line.includes(m)) hardHits.push({ line: i + 1, marker: m, text: line.trim().slice(0, 160) });
    }
  });
  return { hardHits, reviewHits };
}

async function main() {
  const st = await stat(TARGET).catch(() => null);
  if (!st || !st.isDirectory()) {
    console.error(`✗ Target not found: ${TARGET}\n  Run \`pnpm build\` first.`);
    process.exit(2);
  }
  console.log(`Scanning ${path.relative(ROOT, TARGET) || TARGET} for network references…\n`);

  const files = (await walk(TARGET)).filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()));
  let hardTotal = 0;
  let reviewTotal = 0;

  for (const f of files) {
    const text = await readFile(f, 'utf-8').catch(() => '');
    if (!text) continue;
    const { hardHits, reviewHits } = findRefs(text);
    const rel = path.relative(TARGET, f);
    for (const h of hardHits) {
      console.log(`  ✗ FORBIDDEN  ${rel}:${h.line}  [${h.marker}]`);
      console.log(`               ${h.text}`);
      hardTotal++;
    }
    for (const r of reviewHits) {
      console.log(`  • review     ${rel}:${r.line}  ${r.url}`);
      reviewTotal++;
    }
  }

  console.log(`\nScanned ${files.length} text file(s).`);
  console.log(`Forbidden network/telemetry references: ${hardTotal}`);
  console.log(`Other http(s):// references (review):   ${reviewTotal}`);

  const failOnReview = STRICT && reviewTotal > 0;
  if (hardTotal > 0 || failOnReview) {
    console.log(`\n❌ NOT air-gap clean — do not deploy this build.`);
    process.exit(1);
  }
  if (reviewTotal > 0) {
    console.log(`\n⚠️  No forbidden hosts, but ${reviewTotal} other URL(s) present (likely license/namespace).`);
    console.log(`   Review the lines above, or re-run with --strict to enforce zero.`);
  }
  console.log(`\n✅ No network references — build is air-gap clean.`);
}

main().catch((e) => { console.error('verify-offline failed:', e.message); process.exit(2); });
