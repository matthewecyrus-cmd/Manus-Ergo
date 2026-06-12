/**
 * usePoseDetection — ErgoKit MediaPipe BlazePose hook
 * =====================================================
 * Loads @mediapipe/tasks-vision PoseLandmarker (GHUM model).
 * Applies:
 *   1. EMA jitter filter (alpha=0.25)
 *   2. Visibility confidence gating (threshold=0.65)
 *   3. Streams smoothed landmarks at ~30fps via requestAnimationFrame
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import type { Landmarks, ErgoSnapshot } from '@/lib/ergo-engine';
import { EMAFilter, computeSnapshot, DEFAULT_TASK_PROFILE, resetAngleState } from '@/lib/ergo-engine';
import type { TaskProfile } from '@/lib/ergo-engine';

// MediaPipe assets — served LOCALLY from the app bundle (no internet).
// Vendored by scripts/vendor-mediapipe.mjs into client/public/mediapipe/.
// ITAR/on-prem: nothing here may resolve to a remote origin.
const MEDIAPIPE_CDN = '/mediapipe/wasm';
const MODEL_URL = '/mediapipe/models/pose_landmarker_lite.task';

export type PoseStatus =
  | 'idle'
  | 'loading-model'
  | 'ready'
  | 'running'
  | 'no-person'
  | 'error';

export interface PoseDetectionState {
  status: PoseStatus;
  error: string | null;
  landmarks: Landmarks | null;
  worldLandmarks: Landmarks | null;
  snapshot: ErgoSnapshot | null;
  fps: number;
  avgConfidence: number;
}

export interface PoseDetectionControls {
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  setTaskProfile: (profile: TaskProfile) => void;
}

export function usePoseDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
): [PoseDetectionState, PoseDetectionControls] {
  const [status, setStatus] = useState<PoseStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<Landmarks | null>(null);
  const [worldLandmarks, setWorldLandmarks] = useState<Landmarks | null>(null);
  const [snapshot, setSnapshot] = useState<ErgoSnapshot | null>(null);
  const [fps, setFps] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState(0);

  const poseLandmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const emaFilterRef = useRef(new EMAFilter(0.25));
  const emaWorldFilterRef = useRef(new EMAFilter(0.25));
  const taskProfileRef = useRef<TaskProfile>(DEFAULT_TASK_PROFILE);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });
  const runningRef = useRef(false);

  // Load MediaPipe model
  const loadModel = useCallback(async () => {
    if (poseLandmarkerRef.current) return; // already loaded
    setStatus('loading-model');
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      setStatus('ready');
    } catch (err) {
      console.error('[ErgoKit] Failed to load MediaPipe model:', err);
      setError('Failed to load pose detection model. Check your internet connection.');
      setStatus('error');
    }
  }, []);

  // Main detection loop
  const detectLoop = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = poseLandmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    const now = performance.now();

    // Run pose detection
    let result: any;
    try {
      result = landmarker.detectForVideo(video, now);
    } catch {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    // FPS counter
    fpsCounterRef.current.frames++;
    if (now - fpsCounterRef.current.lastTime >= 1000) {
      setFps(fpsCounterRef.current.frames);
      fpsCounterRef.current.frames = 0;
      fpsCounterRef.current.lastTime = now;
    }

    if (result.landmarks && result.landmarks.length > 0) {
      const raw = result.landmarks[0] as Landmarks;
      const world = result.worldLandmarks?.[0] as Landmarks ?? raw;
      const hasWorld = !!(result.worldLandmarks && result.worldLandmarks.length > 0);

      // Image landmarks drive the overlay (normalised [0,1]); smooth them for
      // stable rendering. World landmarks drive the validated scoring engine.
      const smoothed = emaFilterRef.current.smooth(raw);
      const smoothedWorld = hasWorld ? emaWorldFilterRef.current.smooth(world) : smoothed;

      // Compute ergonomic snapshot from WORLD landmarks (validated path).
      const snap = computeSnapshot(smoothedWorld, taskProfileRef.current, undefined, hasWorld);

      setLandmarks(smoothed);
      setWorldLandmarks(world);
      if (snap) {
        setSnapshot(snap);
        setAvgConfidence(snap.rula.confidence);
        setStatus('running');
      } else {
        setStatus('no-person');
      }

      // Draw skeleton overlay
      drawSkeleton(canvas, video, smoothed, snap);
    } else {
      setStatus('no-person');
      // Clear canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    rafRef.current = requestAnimationFrame(detectLoop);
  }, [videoRef, canvasRef]);

  const startCamera = useCallback(async () => {
    setError(null);
    await loadModel();
    if (status === 'error') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      emaFilterRef.current.reset();
      emaWorldFilterRef.current.reset();
      resetAngleState(); // clear hold-last-valid state from any previous session
      runningRef.current = true;
      setStatus('running');
      rafRef.current = requestAnimationFrame(detectLoop);
    } catch (err: any) {
      setError(err.message ?? 'Camera access denied.');
      setStatus('error');
    }
  }, [loadModel, detectLoop, status, videoRef]);

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) { video.srcObject = null; }
    emaFilterRef.current.reset();
    emaWorldFilterRef.current.reset();
    setStatus('idle');
    setLandmarks(null);
    setSnapshot(null);
  }, [videoRef]);

  const setTaskProfile = useCallback((profile: TaskProfile) => {
    taskProfileRef.current = profile;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return [
    { status, error, landmarks, worldLandmarks, snapshot, fps, avgConfidence },
    { startCamera, stopCamera, setTaskProfile },
  ];
}

// ─── SKELETON DRAWING ─────────────────────────────────────────────────────────
const POSE_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

import { VISIBILITY_THRESHOLD, extractAngles } from '@/lib/ergo-engine';

// ─── Per-segment angle-based stoplight colors ─────────────────────────────────
const C_SAFE    = '#22c55e';
const C_CAUTION = '#f59e0b';
const C_RISK    = '#f97316';
const C_DANGER  = '#ef4444';

function angleToColor(angle: number, caution: number, risk: number, danger: number): string {
  if (angle >= danger)  return C_DANGER;
  if (angle >= risk)    return C_RISK;
  if (angle >= caution) return C_CAUTION;
  return C_SAFE;
}

const SEG_NECK    = [0, 7, 8, 1, 2, 3, 4, 5, 6];
const SEG_TRUNK   = [11, 12, 23, 24];
const SEG_L_UPPER = [11, 13];
const SEG_R_UPPER = [12, 14];
const SEG_L_LOWER = [13, 15, 17, 19, 21];
const SEG_R_LOWER = [14, 16, 18, 20, 22];
const SEG_L_LEG   = [23, 25, 27, 29, 31];
const SEG_R_LEG   = [24, 26, 28, 30, 32];

function buildLiveColors(lm: Landmarks): Record<number, string> {
  const { angles } = extractAngles(lm);
  const neckColor   = angleToColor(Math.abs(angles.neckFlexion),        10, 20, 30);
  const trunkColor  = angleToColor(angles.trunkFlexion,                 10, 20, 60);
  const lUpperColor = angleToColor(angles.leftUpperArm,                 20, 45, 90);
  const rUpperColor = angleToColor(angles.rightUpperArm,                20, 45, 90);
  const lLowerColor = angleToColor(Math.abs(angles.leftLowerArm - 80),  20, 40, 60);
  const rLowerColor = angleToColor(Math.abs(angles.rightLowerArm - 80), 20, 40, 60);
  const lLegColor   = angleToColor(180 - angles.leftKnee,               10, 30, 60);
  const rLegColor   = angleToColor(180 - angles.rightKnee,              10, 30, 60);
  const map: Record<number, string> = {};
  for (const i of SEG_NECK)    map[i] = neckColor;
  for (const i of SEG_TRUNK)   map[i] = trunkColor;
  for (const i of SEG_L_UPPER) map[i] = lUpperColor;
  for (const i of SEG_R_UPPER) map[i] = rUpperColor;
  for (const i of SEG_L_LOWER) map[i] = lLowerColor;
  for (const i of SEG_R_LOWER) map[i] = rLowerColor;
  for (const i of SEG_L_LEG)   map[i] = lLegColor;
  for (const i of SEG_R_LEG)   map[i] = rLegColor;
  return map;
}

function letterboxRectLive(cW: number, cH: number, vW: number, vH: number) {
  const scale = Math.min(cW / vW, cH / vH);
  const drawW = vW * scale;
  const drawH = vH * scale;
  return { x: (cW - drawW) / 2, y: (cH - drawH) / 2, w: drawW, h: drawH };
}

// Canvas buffer is sized once by the LiveScan component on mount/resize.
// drawSkeleton NEVER resizes canvas.width/height — that forces a GPU flush every frame.
function drawSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  lm: Landmarks,
  _snap: ErgoSnapshot | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cW = canvas.width  || canvas.offsetWidth  || 640;
  const cH = canvas.height || canvas.offsetHeight || 480;
  const rawW = video.videoWidth  || 640;
  const rawH = video.videoHeight || 480;
  // Rotation-aware letterbox: detect if browser has rotated the video
  const displayAR = (video.clientWidth || cW) / (video.clientHeight || cH);
  const rawAR = rawW / rawH;
  const isRotated = Math.abs(displayAR - rawAR) > 0.3 && Math.abs(displayAR - (1 / rawAR)) < 0.3;
  const effW = isRotated ? rawH : rawW;
  const effH = isRotated ? rawW : rawH;
  // Canvas is transparent — video element is visible underneath (handles rotation correctly)
  const lb = letterboxRectLive(cW, cH, effW, effH);
  ctx.clearRect(0, 0, cW, cH);

  const colorMap = buildLiveColors(lm);
  const px = (lmx: number) => lb.x + lmx * lb.w;
  const py = (lmy: number) => lb.y + lmy * lb.h;

  // Visibility tiers
  const CONF_SOLID  = 0.50;  // solid gradient + filled joint
  const CONF_DASHED = 0.15;  // dashed + hollow joint (estimated position)
  const CONF_FLOOR  = Math.min(VISIBILITY_THRESHOLD, CONF_DASHED);

  // Minimum visible landmark guard — suppress skeleton when too few landmarks are
  // above the confidence threshold to avoid misleading partial skeletons.
  const MIN_VISIBLE_LIVE = 15;
  const visCountLive = lm.filter(l => l && (l.visibility ?? 0) >= CONF_FLOOR).length;
  if (visCountLive < MIN_VISIBLE_LIVE) return;

  // Draw connections — thin, round caps, gradient between different risk colors
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.5;
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = lm[a], lb2 = lm[b];
    if (!la || !lb2) continue;
    const vaA = la.visibility ?? 0;
    const vaB = lb2.visibility ?? 0;
    if (vaA < CONF_FLOOR || vaB < CONF_FLOOR) continue;
    const isDashed = vaA < CONF_SOLID || vaB < CONF_SOLID;
    const cA = colorMap[a] ?? C_SAFE;
    const cB = colorMap[b] ?? C_SAFE;
    if (isDashed) {
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = cA;
    } else {
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
      if (cA === cB) {
        ctx.strokeStyle = cA;
      } else {
        // Always build the gradient top-to-bottom (min Y first) so that in a deep squat,
        // where the knee Y is above the hip Y in screen space, the color stops are not
        // inverted — the joint at the higher screen position gets its own color.
        const paY = py(la.y), pbY = py(lb2.y);
        const topIsA = paY <= pbY;
        const [gx1, gy1, gc0, gx2, gy2, gc1] = topIsA
          ? [px(la.x), paY, cA, px(lb2.x), pbY, cB]
          : [px(lb2.x), pbY, cB, px(la.x), paY, cA];
        const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
        grad.addColorStop(0, gc0);
        grad.addColorStop(1, gc1);
        ctx.strokeStyle = grad;
      }
    }
    ctx.beginPath();
    ctx.moveTo(px(la.x), py(la.y));
    ctx.lineTo(px(lb2.x), py(lb2.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;

  // Draw joints
  for (let i = 0; i < lm.length; i++) {
    const pt = lm[i];
    if (!pt) continue;
    const v = pt.visibility ?? 0;
    if (v < CONF_FLOOR) continue;
    if (v < CONF_SOLID) {
      // Estimated position — hollow dashed circle
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(px(pt.x), py(pt.y), 3, 0, Math.PI * 2);
      ctx.strokeStyle = colorMap[i] ?? C_SAFE;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // High-confidence — solid filled dot
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.arc(px(pt.x), py(pt.y), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = colorMap[i] ?? C_SAFE;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1.0;
}
