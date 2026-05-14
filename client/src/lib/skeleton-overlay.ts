/**
 * skeleton-overlay.ts — ErgoKit
 *
 * CRITICAL COORDINATE FIX:
 * MediaPipe normalises landmarks to [0,1] relative to the source image.
 * When we call detect(videoElement) the source is the full native frame.
 * The canvas must be sized to the RENDERED display dimensions, not the
 * native video resolution.  Use getBoundingClientRect() on the video/canvas
 * element to get displayWidth/displayHeight, then set canvas.width = displayWidth.
 *
 * Per-joint risk colouring gives a heat-map effect where each joint is
 * coloured by its individual angle contribution to the risk score.
 */

import type { Landmark } from "./ergo-engine";

// ─── BlazePose landmark indices ───────────────────────────────────────────────
export const LM = {
  NOSE: 0,
  L_EYE_INNER: 1, L_EYE: 2, L_EYE_OUTER: 3,
  R_EYE_INNER: 4, R_EYE: 5, R_EYE_OUTER: 6,
  L_EAR: 7, R_EAR: 8,
  MOUTH_L: 9, MOUTH_R: 10,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_PINKY: 17,    R_PINKY: 18,
  L_INDEX: 19,    R_INDEX: 20,
  L_THUMB: 21,    R_THUMB: 22,
  L_HIP: 23,      R_HIP: 24,
  L_KNEE: 25,     R_KNEE: 26,
  L_ANKLE: 27,    R_ANKLE: 28,
  L_HEEL: 29,     R_HEEL: 30,
  L_FOOT: 31,     R_FOOT: 32,
} as const;

// ─── Bone connections ─────────────────────────────────────────────────────────
export const BONES: [number, number][] = [
  [LM.L_EAR, LM.L_SHOULDER], [LM.R_EAR, LM.R_SHOULDER],
  [LM.NOSE, LM.L_EYE], [LM.NOSE, LM.R_EYE],
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW,    LM.L_WRIST],
  [LM.L_WRIST,    LM.L_INDEX],
  [LM.L_WRIST,    LM.L_PINKY],
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW,    LM.R_WRIST],
  [LM.R_WRIST,    LM.R_INDEX],
  [LM.R_WRIST,    LM.R_PINKY],
  [LM.L_HIP,   LM.L_KNEE],
  [LM.L_KNEE,  LM.L_ANKLE],
  [LM.L_ANKLE, LM.L_HEEL],
  [LM.L_HEEL,  LM.L_FOOT],
  [LM.R_HIP,   LM.R_KNEE],
  [LM.R_KNEE,  LM.R_ANKLE],
  [LM.R_ANKLE, LM.R_HEEL],
  [LM.R_HEEL,  LM.R_FOOT],
];

// ─── Risk colours ─────────────────────────────────────────────────────────────
const C_SAFE      = "#22c55e";
const C_LOW       = "#84cc16";
const C_MEDIUM    = "#f59e0b";
const C_HIGH      = "#ef4444";
const C_VERY_HIGH = "#dc2626";
const C_NEUTRAL   = "#94a3b8";

function scoreToColor(score: number, max: number): string {
  const r = score / max;
  if (r < 0.25) return C_SAFE;
  if (r < 0.45) return C_LOW;
  if (r < 0.65) return C_MEDIUM;
  if (r < 0.85) return C_HIGH;
  return C_VERY_HIGH;
}

function buildJointColors(
  scores: { rula: number; reba: number } | null,
  angles?: Record<string, number>,
): Record<number, string> {
  if (!scores) return {};
  const rulaColor = scoreToColor(scores.rula, 7);
  const rebaColor = scoreToColor(scores.reba, 15);
  const m: Record<number, string> = {};

  // Neck
  const neck = angles?.neckFlexion !== undefined
    ? (Math.abs(angles.neckFlexion) > 45 ? C_VERY_HIGH
      : Math.abs(angles.neckFlexion) > 20 ? C_HIGH
      : Math.abs(angles.neckFlexion) > 10 ? C_MEDIUM : C_SAFE)
    : rulaColor;
  [LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_EYE, LM.R_EYE,
   LM.L_EYE_INNER, LM.R_EYE_INNER, LM.L_EYE_OUTER, LM.R_EYE_OUTER,
   LM.MOUTH_L, LM.MOUTH_R].forEach(i => { m[i] = neck; });

  // Shoulders
  const sh = angles?.rShoulderElevation !== undefined
    ? (Math.abs(angles.rShoulderElevation) > 90 ? C_VERY_HIGH
      : Math.abs(angles.rShoulderElevation) > 60 ? C_HIGH
      : Math.abs(angles.rShoulderElevation) > 20 ? C_MEDIUM : C_SAFE)
    : rulaColor;
  [LM.L_SHOULDER, LM.R_SHOULDER].forEach(i => { m[i] = sh; });

  // Elbows
  const el = angles?.rElbowFlexion !== undefined
    ? (angles.rElbowFlexion < 60 || angles.rElbowFlexion > 100 ? C_HIGH
      : angles.rElbowFlexion < 70 || angles.rElbowFlexion > 90 ? C_MEDIUM : C_SAFE)
    : rulaColor;
  [LM.L_ELBOW, LM.R_ELBOW].forEach(i => { m[i] = el; });

  // Wrists
  const wr = angles?.rWristDeviation !== undefined
    ? (Math.abs(angles.rWristDeviation) > 30 ? C_VERY_HIGH
      : Math.abs(angles.rWristDeviation) > 15 ? C_HIGH
      : Math.abs(angles.rWristDeviation) > 5 ? C_MEDIUM : C_SAFE)
    : rulaColor;
  [LM.L_WRIST, LM.R_WRIST, LM.L_INDEX, LM.R_INDEX,
   LM.L_PINKY, LM.R_PINKY, LM.L_THUMB, LM.R_THUMB].forEach(i => { m[i] = wr; });

  // Trunk / hips
  const tr = angles?.trunkFlexion !== undefined
    ? (Math.abs(angles.trunkFlexion) > 60 ? C_VERY_HIGH
      : Math.abs(angles.trunkFlexion) > 20 ? C_HIGH
      : Math.abs(angles.trunkFlexion) > 10 ? C_MEDIUM : C_SAFE)
    : rebaColor;
  [LM.L_HIP, LM.R_HIP].forEach(i => { m[i] = tr; });

  // Knees
  const kn = angles?.lKneeFlexion !== undefined
    ? (angles.lKneeFlexion > 90 ? C_HIGH
      : angles.lKneeFlexion > 60 ? C_MEDIUM : C_SAFE)
    : rebaColor;
  [LM.L_KNEE, LM.R_KNEE].forEach(i => { m[i] = kn; });

  // Ankles / feet
  [LM.L_ANKLE, LM.R_ANKLE, LM.L_HEEL, LM.R_HEEL,
   LM.L_FOOT, LM.R_FOOT].forEach(i => { m[i] = rebaColor; });

  return m;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface DrawOptions {
  landmarks: Landmark[];
  scores: { rula: number; reba: number } | null;
  angles?: Record<string, number>;
  canvas: HTMLCanvasElement;
  /**
   * RENDERED display width in CSS pixels (from getBoundingClientRect().width).
   * DO NOT pass video.videoWidth — that is the native resolution.
   */
  displayWidth: number;
  displayHeight: number;
  minVisibility?: number;
  showBadge?: boolean;
}

export function drawSkeleton({
  landmarks,
  scores,
  angles,
  canvas,
  displayWidth,
  displayHeight,
  minVisibility = 0.30,
  showBadge = true,
}: DrawOptions): void {
  if (!landmarks || landmarks.length === 0) return;

  // Size canvas buffer to displayed dimensions (DPR-aware)
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(displayWidth  * dpr);
  canvas.height = Math.round(displayHeight * dpr);
  canvas.style.width  = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  const W = displayWidth;
  const H = displayHeight;
  const jointColors = buildJointColors(scores, angles);

  const px = (idx: number) => {
    const lm = landmarks[idx];
    if (!lm) return null;
    return { x: lm.x * W, y: lm.y * H, v: lm.visibility ?? 1 };
  };

  // Draw bones
  const boneW = Math.max(2.5, W / 280);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [a, b] of BONES) {
    const pa = px(a), pb = px(b);
    if (!pa || !pb) continue;
    if (pa.v < minVisibility || pb.v < minVisibility) continue;
    const cA = jointColors[a] ?? C_NEUTRAL;
    const cB = jointColors[b] ?? C_NEUTRAL;
    const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
    grad.addColorStop(0, cA + "dd");
    grad.addColorStop(1, cB + "dd");
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur  = 3;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth   = boneW;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Draw joints
  const rBase = Math.max(5, W / 100);
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm || (lm.visibility ?? 1) < minVisibility) continue;
    const x = lm.x * W, y = lm.y * H;
    const color = jointColors[i] ?? C_NEUTRAL;
    // Glow
    ctx.beginPath(); ctx.arc(x, y, rBase * 2.0, 0, Math.PI * 2);
    ctx.fillStyle = color + "28"; ctx.fill();
    // Mid ring
    ctx.beginPath(); ctx.arc(x, y, rBase * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = color + "55"; ctx.fill();
    // Core
    ctx.beginPath(); ctx.arc(x, y, rBase, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    // Highlight
    ctx.beginPath(); ctx.arc(x - rBase * 0.25, y - rBase * 0.25, rBase * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fill();
  }

  // Score badge
  if (showBadge && scores) {
    const pad = 10, lineH = 20, badgeW = 120;
    const badgeH = pad * 2 + lineH * 2 + 4;
    const fs = Math.max(12, W / 55);
    ctx.fillStyle = "rgba(0,0,0,0.70)";
    ctx.beginPath(); ctx.roundRect(pad, pad, badgeW, badgeH, 7); ctx.fill();
    const items = [
      { label: "RULA", val: scores.rula.toFixed(1), max: 7 },
      { label: "REBA", val: scores.reba.toFixed(1), max: 15 },
    ];
    items.forEach((item, i) => {
      const color = scoreToColor(parseFloat(item.val), item.max);
      const y = pad + fs + i * (lineH + 2);
      ctx.font = `600 ${fs}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = "#ffffff99"; ctx.fillText(item.label, pad + 8, y);
      ctx.fillStyle = color; ctx.fillText(item.val, pad + 62, y);
    });
  }
}

/**
 * Convenience wrapper: draws skeleton on a canvas overlaid on a video element.
 * Automatically reads the video's rendered display size.
 */
export function drawSkeletonOnVideo(
  videoEl: HTMLVideoElement,
  canvasEl: HTMLCanvasElement,
  landmarks: Landmark[],
  scores: { rula: number; reba: number } | null,
  angles?: Record<string, number>,
  minVisibility = 0.30,
): void {
  const rect = videoEl.getBoundingClientRect();
  const displayWidth  = rect.width  > 0 ? rect.width  : videoEl.clientWidth  || 640;
  const displayHeight = rect.height > 0 ? rect.height : videoEl.clientHeight || 360;
  drawSkeleton({ landmarks, scores, angles, canvas: canvasEl, displayWidth, displayHeight, minVisibility, showBadge: true });
}
