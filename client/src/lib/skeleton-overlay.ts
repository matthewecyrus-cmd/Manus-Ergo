/**
 * skeleton-overlay.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Draws a color-coded human skeleton overlay on a <canvas> element that sits
 * on top of a <video> element.  Uses the 33-landmark BlazePose GHUM topology
 * output by MediaPipe Tasks Vision.
 *
 * Color coding:
 *   green  → joint angle within safe range
 *   amber  → moderate risk (caution)
 *   red    → high / very-high risk
 *   grey   → joint not visible / confidence below threshold
 */

import type { Landmark, ScoreResult } from "./ergo-engine";

// ─── BlazePose landmark indices ──────────────────────────────────────────────
export const LM = {
  NOSE: 0,
  L_EYE_INNER: 1, L_EYE: 2, L_EYE_OUTER: 3,
  R_EYE_INNER: 4, R_EYE: 5, R_EYE_OUTER: 6,
  L_EAR: 7, R_EAR: 8,
  MOUTH_L: 9, MOUTH_R: 10,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_PINKY: 17, R_PINKY: 18,
  L_INDEX: 19, R_INDEX: 20,
  L_THUMB: 21, R_THUMB: 22,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30,
  L_FOOT: 31, R_FOOT: 32,
} as const;

// ─── Bone connections (pairs of landmark indices) ────────────────────────────
export const BONES: [number, number][] = [
  // Torso
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  // Left arm
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
  [LM.L_WRIST, LM.L_INDEX],
  // Right arm
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
  [LM.R_WRIST, LM.R_INDEX],
  // Left leg
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.L_ANKLE, LM.L_FOOT],
  // Right leg
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
  [LM.R_ANKLE, LM.R_FOOT],
  // Head
  [LM.L_EAR, LM.L_SHOULDER],
  [LM.R_EAR, LM.R_SHOULDER],
  [LM.NOSE, LM.L_EYE],
  [LM.NOSE, LM.R_EYE],
];

// ─── Risk colour helpers ──────────────────────────────────────────────────────
function riskColor(score: number, max: number): string {
  const ratio = score / max;
  if (ratio < 0.4) return "#22c55e";   // green  – low
  if (ratio < 0.65) return "#f59e0b";  // amber  – moderate
  return "#ef4444";                    // red    – high
}

/** Map each landmark to a risk colour based on the nearest ergo score */
function buildJointColors(scores: { rula: number; reba: number } | null): Record<number, string> {
  if (!scores) return {};
  const rula = riskColor(scores.rula, 7);
  const reba = riskColor(scores.reba, 15);

  // Upper body → RULA-driven; lower body → REBA-driven
  const upper = rula;
  const lower = reba;

  return {
    [LM.L_SHOULDER]: upper, [LM.R_SHOULDER]: upper,
    [LM.L_ELBOW]: upper,    [LM.R_ELBOW]: upper,
    [LM.L_WRIST]: upper,    [LM.R_WRIST]: upper,
    [LM.L_INDEX]: upper,    [LM.R_INDEX]: upper,
    [LM.L_PINKY]: upper,    [LM.R_PINKY]: upper,
    [LM.L_THUMB]: upper,    [LM.R_THUMB]: upper,
    [LM.L_HIP]: lower,      [LM.R_HIP]: lower,
    [LM.L_KNEE]: lower,     [LM.R_KNEE]: lower,
    [LM.L_ANKLE]: lower,    [LM.R_ANKLE]: lower,
    [LM.L_FOOT]: lower,     [LM.R_FOOT]: lower,
    [LM.L_HEEL]: lower,     [LM.R_HEEL]: lower,
    [LM.NOSE]: upper,
    [LM.L_EAR]: upper,      [LM.R_EAR]: upper,
    [LM.L_EYE]: upper,      [LM.R_EYE]: upper,
    [LM.L_EYE_INNER]: upper,[LM.R_EYE_INNER]: upper,
    [LM.L_EYE_OUTER]: upper,[LM.R_EYE_OUTER]: upper,
    [LM.MOUTH_L]: upper,    [LM.MOUTH_R]: upper,
  };
}

// ─── Main draw function ───────────────────────────────────────────────────────
export interface DrawOptions {
  landmarks: Landmark[];
  scores: { rula: number; reba: number } | null;
  canvas: HTMLCanvasElement;
  /** Natural display width of the video/image being overlaid */
  videoWidth: number;
  /** Natural display height of the video/image being overlaid */
  videoHeight: number;
  /** Minimum visibility confidence to draw a joint (default 0.65) */
  minVisibility?: number;
}

export function drawSkeleton({
  landmarks,
  scores,
  canvas,
  videoWidth,
  videoHeight,
  minVisibility = 0.65,
}: DrawOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Match canvas pixel size to the displayed video dimensions
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!landmarks || landmarks.length === 0) return;

  const jointColors = buildJointColors(scores);

  // Helper: get pixel coords for a landmark index
  const px = (idx: number) => {
    const lm = landmarks[idx];
    return {
      x: lm ? lm.x * videoWidth : 0,
      y: lm ? lm.y * videoHeight : 0,
      v: lm?.visibility ?? 0,
    };
  };

  // ── Draw bones ──────────────────────────────────────────────────────────────
  for (const [a, b] of BONES) {
    const pa = px(a);
    const pb = px(b);
    if (pa.v < minVisibility || pb.v < minVisibility) continue;

    const colorA = jointColors[a] !== undefined ? jointColors[a] : "#94a3b8";
    const colorB = jointColors[b] !== undefined ? jointColors[b] : "#94a3b8";

    // Gradient bone: colour transitions from joint A to joint B
    const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
    grad.addColorStop(0, colorA + "cc"); // 80% opacity
    grad.addColorStop(1, colorB + "cc");

    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(2, videoWidth / 200);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // ── Draw joints ─────────────────────────────────────────────────────────────
  const radius = Math.max(4, videoWidth / 120);
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm || (lm.visibility ?? 0) < minVisibility) continue;

    const x = lm.x * videoWidth;
    const y = lm.y * videoHeight;
    const color = jointColors[i] !== undefined ? jointColors[i] : "#94a3b8";

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = color + "33"; // 20% opacity
    ctx.fill();

    // Solid joint dot
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // White centre highlight
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();
  }

  // ── Risk score badge (top-left corner) ─────────────────────────────────────
  if (scores) {
    const pad = 10;
    const lineH = 18;
    const labels: { label: string; val: string; max: number }[] = [
      { label: "RULA", val: scores.rula.toFixed(1), max: 7 },
      { label: "REBA", val: scores.reba.toFixed(1), max: 15 },
    ];

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.roundRect(pad, pad, 110, pad * 2 + lineH * labels.length, 6);
    ctx.fill();

    labels.forEach((item, i) => {
      const color = riskColor(parseFloat(item.val), item.max);
      ctx.font = `bold ${Math.max(11, videoWidth / 80)}px 'DM Sans', sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${item.label}: `, pad + 8, pad + 14 + i * lineH);
      ctx.fillStyle = color;
      ctx.fillText(item.val, pad + 55, pad + 14 + i * lineH);
    });
    ctx.restore();
  }
}
