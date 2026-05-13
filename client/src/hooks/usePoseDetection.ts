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
import { EMAFilter, computeSnapshot, DEFAULT_TASK_PROFILE } from '@/lib/ergo-engine';
import type { TaskProfile } from '@/lib/ergo-engine';

// MediaPipe CDN for WASM + model (offline: swap to local /public path)
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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

      // Apply EMA smoothing
      const smoothed = emaFilterRef.current.smooth(raw);

      // Compute ergonomic snapshot
      const snap = computeSnapshot(smoothed, taskProfileRef.current);

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

import { VISIBILITY_THRESHOLD, riskColor } from '@/lib/ergo-engine';

function drawSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  lm: Landmarks,
  snap: ErgoSnapshot | null,
) {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const W = canvas.width;
  const H = canvas.height;

  // Determine joint risk colors
  const jointColor = (i: number): string => {
    const vis = lm[i]?.visibility ?? 0;
    if (vis < VISIBILITY_THRESHOLD) return 'rgba(255,255,255,0.2)';
    if (!snap) return '#22D3EE';
    // Color upper body joints by RULA risk, lower by REBA
    const upperBody = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    const risk = upperBody.includes(i) ? snap.rula.riskLevel : snap.reba.riskLevel;
    return riskColor(risk);
  };

  // Draw connections
  ctx.lineWidth = 2.5;
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = lm[a], lb = lm[b];
    if (!la || !lb) continue;
    const visA = la.visibility ?? 0;
    const visB = lb.visibility ?? 0;
    if (visA < VISIBILITY_THRESHOLD || visB < VISIBILITY_THRESHOLD) continue;

    ctx.beginPath();
    ctx.moveTo(la.x * W, la.y * H);
    ctx.lineTo(lb.x * W, lb.y * H);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
    ctx.stroke();
  }

  // Draw joints
  for (let i = 0; i < lm.length; i++) {
    const pt = lm[i];
    if (!pt) continue;
    const vis = pt.visibility ?? 0;
    if (vis < VISIBILITY_THRESHOLD) continue;

    const x = pt.x * W;
    const y = pt.y * H;
    const color = jointColor(i);

    // Outer glow
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color.replace(')', ', 0.25)').replace('rgb', 'rgba');
    ctx.fill();

    // Inner dot
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Draw confidence badge on key joints
  const keyLabels: [number, string][] = [
    [11, 'L.Sh'], [12, 'R.Sh'],
    [13, 'L.El'], [14, 'R.El'],
    [15, 'L.Wr'], [16, 'R.Wr'],
    [23, 'L.Hip'], [24, 'R.Hip'],
  ];
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (const [i, label] of keyLabels) {
    const pt = lm[i];
    if (!pt || (pt.visibility ?? 0) < VISIBILITY_THRESHOLD) continue;
    const x = pt.x * W;
    const y = pt.y * H - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 14, y - 9, 28, 11);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y);
  }
}
