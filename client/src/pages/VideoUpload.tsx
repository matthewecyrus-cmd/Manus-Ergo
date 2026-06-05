/**
 * VideoUpload — ErgoKit
 * =====================
 * Architecture:
 *
 * 1. MediaPipe runs in VIDEO mode with timestamps (not IMAGE mode).
 *    detectForVideo(video, timestampMs) is called with the actual video timestamp.
 *    This gives MediaPipe temporal context for better tracking continuity.
 *
 * 2. Overlay rendering is driven by requestVideoFrameCallback (rVFC) where
 *    available, with requestAnimationFrame as fallback. This ties the canvas
 *    redraw to the actual decoded video frame — no arbitrary seek delays.
 *
 * 3. Two separate loops:
 *    - OVERLAY loop (rVFC/rAF): runs every decoded frame, draws skeleton on canvas.
 *      Stores latest landmarks in a ref. Does NOT update React state.
 *    - REPORT loop (setInterval, 500ms): reads the latest landmarks ref,
 *      runs ergo scoring, pushes to snapshots array. Updates React state
 *      (liveScores, progress) at most every 500ms.
 *
 * 4. Skeleton visual weight:
 *    - lineWidth: 1.5px (scaled by canvas width, max 2px)
 *    - joint radius: 2.5px max
 *    - NO white halo rings
 *    - Default: single clean cyan (#06b6d4) skeleton
 *    - Risk colors: optional toggle, off by default
 *
 * 5. React state updates are throttled — no setState per frame.
 *
 * CANVAS SIZING:
 *   canvas.width = canvas.offsetWidth (CSS px, no DPR multiply)
 *   Letterbox: scale = min(W/vW, H/vH), drawX/Y = centered offset
 *   Landmark mapping: px = drawX + lm.x * drawW
 */
import { useRef, useState, useCallback, useContext, useEffect, startTransition } from 'react';
import { useLocation } from 'wouter';
import {
  Upload, Film, Play, CheckCircle2, AlertCircle,
  Settings2, ChevronRight, X, FileVideo, ChevronDown, ChevronUp,
  Pause, Square, StopCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useSession, SessionContext } from '@/contexts/SessionContext';
import { EMAFilter, computeSnapshot, riskLabel, summarizeSession, extractAngles, resetAngleState } from '@/lib/ergo-engine';
import type { TaskProfile, ErgoSnapshot, SessionSource, SessionRecord, BodyAngles } from '@/lib/ergo-engine';
import { saveVideo } from '@/lib/video-store';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

type AnalysisState = 'idle' | 'loading-model' | 'analyzing' | 'done' | 'error';

// ─── Skeleton colors ──────────────────────────────────────────────────────────
const CYAN = '#06b6d4';
const C_GREEN  = '#22c55e';
const C_YELLOW = '#eab308';
const C_ORANGE = '#f97316';
const C_RED    = '#ef4444';

function angleToColor(angle: number, thresholds: [number, number, number]): string {
  const [t1, t2, t3] = thresholds;
  if (angle > t3) return C_RED;
  if (angle > t2) return C_ORANGE;
  if (angle > t1) return C_YELLOW;
  return C_GREEN;
}

function getSegmentColors(angles: BodyAngles) {
  return {
    neck:     angleToColor(Math.abs(angles.neckFlexion),   [10, 20, 30]),
    trunk:    angleToColor(Math.abs(angles.trunkFlexion),  [5,  20, 60]),
    upperArm: angleToColor(Math.max(angles.leftUpperArm, angles.rightUpperArm), [20, 45, 90]),
    lowerArm: (() => {
      const worst = (a: number) => {
        const d = Math.abs(a - 80); // 80° is optimal
        return d > 50 ? C_RED : d > 30 ? C_ORANGE : d > 15 ? C_YELLOW : C_GREEN;
      };
      const scores = [C_GREEN, C_YELLOW, C_ORANGE, C_RED];
      const li = scores.indexOf(worst(angles.leftLowerArm));
      const ri = scores.indexOf(worst(angles.rightLowerArm));
      return scores[Math.max(li, ri)];
    })(),
    wrist:    angleToColor(Math.max(angles.leftWrist, angles.rightWrist), [8, 15, 30]),
    legs:     (() => {
      const a = Math.min(angles.leftKnee, angles.rightKnee);
      if (a < 90)  return C_RED;
      if (a < 120) return C_ORANGE;
      if (a < 150) return C_YELLOW;
      return C_GREEN;
    })(),
  };
}

type SegColors = ReturnType<typeof getSegmentColors>;

// ─── Skeleton connections ─────────────────────────────────────────────────────
type Seg = keyof SegColors;
interface Conn { a: number; b: number; seg: Seg }

const CONNECTIONS: Conn[] = [
  // Neck / head
  { a:0,  b:11, seg:'neck' },   { a:0,  b:12, seg:'neck' },
  { a:7,  b:11, seg:'neck' },   { a:8,  b:12, seg:'neck' }, // ear-shoulder
  // Torso
  { a:11, b:12, seg:'trunk' },  { a:11, b:23, seg:'trunk' },
  { a:12, b:24, seg:'trunk' },  { a:23, b:24, seg:'trunk' },
  // Upper arms
  { a:11, b:13, seg:'upperArm' }, { a:12, b:14, seg:'upperArm' },
  // Lower arms
  { a:13, b:15, seg:'lowerArm' }, { a:14, b:16, seg:'lowerArm' },
  // Hands
  { a:15, b:17, seg:'wrist' },  { a:15, b:19, seg:'wrist' },
  { a:17, b:19, seg:'wrist' },  { a:16, b:18, seg:'wrist' },
  { a:16, b:20, seg:'wrist' },  { a:18, b:20, seg:'wrist' },
  // Legs
  { a:23, b:25, seg:'legs' },   { a:25, b:27, seg:'legs' },
  { a:24, b:26, seg:'legs' },   { a:26, b:28, seg:'legs' },
  // Feet
  { a:27, b:29, seg:'legs' },   { a:28, b:30, seg:'legs' },
  { a:27, b:31, seg:'legs' },   { a:28, b:32, seg:'legs' },
  { a:29, b:31, seg:'legs' },   { a:30, b:32, seg:'legs' },
];

const JOINT_SEG: Record<number, Seg> = {
  0:'neck',1:'neck',2:'neck',3:'neck',4:'neck',5:'neck',6:'neck',7:'neck',8:'neck',9:'neck',10:'neck',
  11:'trunk',12:'trunk',
  13:'upperArm',14:'upperArm',
  15:'lowerArm',16:'lowerArm',
  17:'wrist',18:'wrist',19:'wrist',20:'wrist',21:'wrist',22:'wrist',
  23:'trunk',24:'trunk',
  25:'legs',26:'legs',27:'legs',28:'legs',29:'legs',30:'legs',31:'legs',32:'legs',
};

// ─── Canvas draw — called every decoded frame ─────────────────────────────────
// NOTE: The video element is visible underneath the canvas (handles rotation correctly).
// The canvas is transparent — we only draw the skeleton overlay here.
// Landmark coordinates from MediaPipe are relative to the RAW video frame (videoWidth x videoHeight).
// The browser displays the video with CSS object-contain, which letterboxes it.
// We must compute the same letterbox rect to map landmarks to canvas pixels.
function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  video: HTMLVideoElement,
  landmarks: any[],
  riskColors: boolean,
  segColors: SegColors | null,
) {
  // Letterbox: map normalized [0,1] landmark coords to the area the video
  // actually occupies inside the canvas (object-contain letterboxing).
  // MediaPipe normalizes landmarks to the decoded frame dimensions (videoWidth x videoHeight),
  // so we use those directly — no rotation detection needed.
  const rawW = video.videoWidth  || W;
  const rawH = video.videoHeight || H;
  const scale = Math.min(W / rawW, H / rawH);
  const drawW = rawW * scale;
  const drawH = rawH * scale;
  const drawX = (W - drawW) / 2;
  const drawY = (H - drawH) / 2;

  const px = (nx: number) => drawX + nx * drawW;
  const py = (ny: number) => drawY + ny * drawH;
  const CONF = 0.25;

  const lw = Math.min(2, Math.max(1.5, drawW / 400));
  const jr = Math.min(2.5, Math.max(2, drawW / 250));

  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const conn of CONNECTIONS) {
    const la = landmarks[conn.a];
    const lb = landmarks[conn.b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 1) < CONF || (lb.visibility ?? 1) < CONF) continue;
    ctx.beginPath();
    ctx.moveTo(px(la.x), py(la.y));
    ctx.lineTo(px(lb.x), py(lb.y));
    ctx.strokeStyle = (riskColors && segColors) ? segColors[conn.seg] : CYAN;
    ctx.stroke();
  }

  for (let i = 0; i < landmarks.length; i++) {
    const pt = landmarks[i];
    if (!pt || (pt.visibility ?? 1) < CONF) continue;
    const seg = JOINT_SEG[i] ?? 'trunk';
    ctx.beginPath();
    ctx.arc(px(pt.x), py(pt.y), jr, 0, Math.PI * 2);
    ctx.fillStyle = (riskColors && segColors) ? segColors[seg] : CYAN;
    ctx.fill();
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VideoUpload() {
  const [, navigate] = useLocation();
  const { sessions, taskProfile, setTaskProfile } = useSession();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [liveScores, setLiveScores] = useState<{ rula: number; reba: number } | null>(null);
  const [riskColors, setRiskColors] = useState(true); // ON by default — risk colors are the primary value of the overlay
  const [framesAnalyzed, setFramesAnalyzed] = useState(0);

  const [assessor, setAssessor] = useState('');
  const [department, setDepartment] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [configOpen, setConfigOpen] = useState(true);
  const [videoAspect, setVideoAspect] = useState<string>('16 / 9');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<any>(null);
  // EMA alpha 0.45: responsive enough to track normal movement, but with velocity clamping
  // in EMAFilter to prevent landmark jump artifacts during fast motion
  const emaRef = useRef(new EMAFilter(0.45));
  const taskProfileRef = useRef<TaskProfile>(taskProfile);

  // Refs for the overlay loop — no React state updates per frame
  const latestLandmarksRef = useRef<any[] | null>(null);
  const latestSegColorsRef = useRef<SegColors | null>(null);
  const rVFCHandleRef = useRef<number | null>(null);
  const rAFHandleRef = useRef<number | null>(null);
  const reportIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotsRef = useRef<ErgoSnapshot[]>([]);
  const thumbnailCapturedRef = useRef(false);
  const thumbnailDataUrlRef = useRef<string | undefined>(undefined);
  const lastReportTimeRef = useRef(0);
  const isRunningRef = useRef(false);
  const riskColorsRef = useRef(riskColors);
  useEffect(() => { riskColorsRef.current = riskColors; }, [riskColors]);

  // Size canvas buffer to match CSS display size on mount and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sizeCanvas = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w > 4 && h > 4 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Please upload a video file (mp4, mov, webm, avi).');
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setAnalysisState('idle');
    setProgress(0);
    setFramesAnalyzed(0);
    setResultId(null);
    setErrorMsg(null);
    setLiveScores(null);
  }, [videoUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const loadModel = useCallback(async () => {
    if (poseLandmarkerRef.current) return;
    const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
    const base = { modelAssetPath: MODEL_URL };
    const opts = {
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    };
    try {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { ...base, delegate: 'GPU' as const }, ...opts,
      });
    } catch {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { ...base, delegate: 'CPU' as const }, ...opts,
      });
    }
  }, []);

  const stopLoops = useCallback(() => {
    isRunningRef.current = false;
    if (rVFCHandleRef.current !== null) {
      const v = videoRef.current;
      if (v && 'cancelVideoFrameCallback' in v) {
        (v as any).cancelVideoFrameCallback(rVFCHandleRef.current);
      }
      rVFCHandleRef.current = null;
    }
    if (rAFHandleRef.current !== null) {
      cancelAnimationFrame(rAFHandleRef.current);
      rAFHandleRef.current = null;
    }
    if (reportIntervalRef.current !== null) {
      clearInterval(reportIntervalRef.current);
      reportIntervalRef.current = null;
    }
  }, []);

  const sessionCtx = useContext(SessionContext);
  const addSession = useCallback((record: SessionRecord) => {
    sessionCtx?.addSession(record);
  }, [sessionCtx]);

  const finishAnalysis = useCallback(() => {
    stopLoops();
    const snapshots = snapshotsRef.current;
    const video = videoRef.current;
    if (!video) return;

    if (snapshots.length === 0) {
      setErrorMsg('No pose detected. Ensure the worker fills at least 30% of the frame with good lighting.');
      setAnalysisState('error');
      return;
    }

    const record = summarizeSession(
      snapshots, taskProfileRef.current, Math.round(video.duration || 0),
      'video-upload' as SessionSource,
      {
        assessor: assessor || undefined,
        department: department || undefined,
        location: workLocation || undefined,
        notes: notes || undefined,
        thumbnailDataUrl: thumbnailDataUrlRef.current,
      },
    );
    if (baselineId) (record as any).baselineSessionId = baselineId;
    // Do NOT store blob URL — it dies on navigation.
    // Save the raw video blob to IndexedDB keyed by session ID instead.
    // SessionReport will call loadVideo(session.id) to get a fresh Object URL.
    (record as any).videoUrl = undefined;

    addSession(record);
    setResultId(record.id);
    setAnalysisState('done');
    setProgress(100);

    // Seek back to frame 0 and draw the first snapshot's skeleton as a "done" state
    if (video) {
      const drawFinalFrame = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width || canvas.offsetWidth;
        const H = canvas.height || canvas.offsetHeight;
        // Find the snapshot closest to t=0 to show as the final overlay
        const firstSnap = snapshotsRef.current.slice().sort((a, b) => a.timestamp - b.timestamp)[0];
        const lm = firstSnap?.landmarks ?? latestLandmarksRef.current ?? [];
        const segColors = latestSegColorsRef.current;
        drawSkeleton(ctx, W, H, video, lm, true, segColors);
      };
      video.currentTime = 0;
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        drawFinalFrame();
      };
      video.addEventListener('seeked', onSeeked);
      // Fallback: draw after 600ms regardless
      setTimeout(drawFinalFrame, 600);
    }

    // Persist video blob to IDB (fire-and-forget — don't block UI)
    if (videoFile) {
      saveVideo(record.id, videoFile).catch(err =>
        console.warn('[ErgoKit] Could not save video to IDB:', err)
      );
    }

    toast.success('Analysis complete!', {
      description: `${snapshots.length} samples · Peak risk: ${riskLabel(record.peakRisk)}`,
      action: { label: 'View Report', onClick: () => navigate(`/sessions/${record.id}`) },
    });
  }, [stopLoops, assessor, department, workLocation, notes, baselineId, videoFile, addSession, navigate]);

  const startOverlayLoop = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawFrame = (timestampMs: number) => {
      if (!isRunningRef.current) return;

      const W = canvas.width;
      const H = canvas.height;
      if (W < 4 || H < 4) return;

      // Canvas is transparent — video element is visible underneath (handles rotation correctly)
      ctx.clearRect(0, 0, W, H);

      // Run MediaPipe VIDEO mode with actual video timestamp
      if (poseLandmarkerRef.current && !video.paused && !video.ended) {
        try {
          const result = poseLandmarkerRef.current.detectForVideo(video, timestampMs);
          if (result?.landmarks?.length > 0) {
            const raw = result.landmarks[0];

            // Confidence gating: compute average visibility of key structural landmarks
            // (shoulders, hips, knees — indices 11,12,23,24,25,26)
            // If confidence is too low, the tracking has lost the person (fast motion artifact)
            // Keep the last valid landmarks rather than updating with garbage data
            const KEY_LM = [11, 12, 23, 24, 25, 26];
            const avgConf = KEY_LM.reduce((sum, i) => sum + (raw[i]?.visibility ?? 0), 0) / KEY_LM.length;

            if (avgConf >= 0.35) {
              // Good confidence — update with smoothed landmarks
              const smoothed = emaRef.current.smooth(raw);
              latestLandmarksRef.current = smoothed;
              // Compute segment colors (cheap — just angle math)
              const { angles } = extractAngles(smoothed);
              latestSegColorsRef.current = getSegmentColors(angles);
            }
            // else: low confidence (fast motion / occlusion) — keep last valid landmarks
            // The EMA smoother will naturally decay toward the new position once tracking recovers
          } else {
            latestLandmarksRef.current = null;
            latestSegColorsRef.current = null;
            emaRef.current.reset(); // Reset EMA so it doesn't blend stale data when tracking resumes
          }
        } catch { /* skip frame */ }
      }

      // Draw skeleton overlay (canvas is transparent, video shows through)
      // Guard: only draw if video has decoded dimensions (readyState >= 2 = HAVE_CURRENT_DATA)
      const lm = latestLandmarksRef.current;
      if (lm && lm.length > 0 && video.readyState >= 2 && video.videoWidth > 0) {
        drawSkeleton(ctx, W, H, video, lm, riskColorsRef.current, latestSegColorsRef.current);
      }

      // Capture thumbnail at 25% of video
      // Draw video frame + skeleton onto an offscreen canvas for the thumbnail
      if (!thumbnailCapturedRef.current && video.duration > 0 && video.currentTime >= video.duration * 0.25) {
        thumbnailCapturedRef.current = true;
        try {
          const thumb = document.createElement('canvas');
          thumb.width = W; thumb.height = H;
          const tCtx = thumb.getContext('2d')!;
          // Draw video frame (handles rotation via CSS, but drawImage uses raw frame)
          // Use same letterbox math as the overlay
          const rawW = video.videoWidth || W;
          const rawH = video.videoHeight || H;
          const scale = Math.min(W / rawW, H / rawH);
          const dW = rawW * scale; const dH = rawH * scale;
          const dX = (W - dW) / 2; const dY = (H - dH) / 2;
          tCtx.fillStyle = '#000';
          tCtx.fillRect(0, 0, W, H);
          tCtx.drawImage(video, dX, dY, dW, dH);
          // Composite skeleton overlay on top
          tCtx.drawImage(canvas, 0, 0);
          thumbnailDataUrlRef.current = thumb.toDataURL('image/jpeg', 0.7);
        } catch { /* skip thumbnail */ }
      }

      // Schedule next frame
      if ('requestVideoFrameCallback' in video) {
        rVFCHandleRef.current = (video as any).requestVideoFrameCallback(
          (_: DOMHighResTimeStamp, meta: { mediaTime: number }) => {
            if (isRunningRef.current) drawFrame(meta.mediaTime * 1000);
          }
        );
      } else {
        rAFHandleRef.current = requestAnimationFrame(() => {
          if (isRunningRef.current) drawFrame(performance.now());
        });
      }
    };

    // Kick off the loop
    if ('requestVideoFrameCallback' in video) {
      rVFCHandleRef.current = (video as any).requestVideoFrameCallback(
        (_: DOMHighResTimeStamp, meta: { mediaTime: number }) => {
          if (isRunningRef.current) drawFrame(meta.mediaTime * 1000);
        }
      );
    } else {
      rAFHandleRef.current = requestAnimationFrame(() => {
        if (isRunningRef.current) drawFrame(performance.now());
      });
    }
  }, []);

  const startReportSampler = useCallback((video: HTMLVideoElement) => {
      // Sample at 250ms intervals — update React state and collect snapshots
    // 333ms = ~3fps sampling rate — sufficient for ergonomic posture analysis
    // (REBA/RULA are static posture tools; 3fps captures all meaningful posture changes)
    reportIntervalRef.current = setInterval(() => {
      if (!isRunningRef.current || video.paused || video.ended) return;
      const lm = latestLandmarksRef.current;
      if (!lm) return;
      lastReportTimeRef.current = Date.now();

      const snap = computeSnapshot(lm, taskProfileRef.current);
      if (snap) {
        snapshotsRef.current.push({ ...snap, timestamp: video.currentTime * 1000, landmarks: lm });
        // Use startTransition so React batches these low-priority UI updates
        // without blocking the video frame rendering loop
        const ct = video.currentTime;
        const dur = video.duration;
        startTransition(() => {
          setFramesAnalyzed(n => n + 1);
          setLiveScores({ rula: snap.rula.score, reba: snap.reba.score });
          if (dur > 0) setProgress(Math.round((ct / dur) * 100));
        });
      }
    }, 333);
  }, []);

  const analyzeVideo = useCallback(async () => {
    if (!videoFile || !videoUrl) return;
    setAnalysisState('loading-model');
    setErrorMsg(null);
    setLiveScores(null);
    setProgress(0);
    setFramesAnalyzed(0);
    snapshotsRef.current = [];
    thumbnailCapturedRef.current = false;
    thumbnailDataUrlRef.current = undefined;

    // Seek to frame 0 immediately so the video shows the first frame during model loading
    // (not a black screen from wherever the user left the scrubber)
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.currentTime = 0;
      // Wait for seek to complete so the frame is visible during loading
      await new Promise<void>(resolve => {
        const onSeeked = () => { videoEl.removeEventListener('seeked', onSeeked); resolve(); };
        videoEl.addEventListener('seeked', onSeeked);
        // Fallback timeout in case seeked never fires (e.g. already at 0)
        setTimeout(resolve, 300);
      });
    }

    try { await loadModel(); } catch {
      setErrorMsg('Failed to load pose detection model. Check your internet connection.');
      setAnalysisState('error');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Size canvas buffer to CSS pixel dimensions
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (w > 4 && h > 4) { canvas.width = w; canvas.height = h; }

    emaRef.current.reset();
    resetAngleState(); // clear hold-last-valid state from any previous session
    isRunningRef.current = true;
    setAnalysisState('analyzing');

    // Start video playback
    video.currentTime = 0;
    try { await video.play(); } catch { /* autoplay may be blocked */ }

    // Start overlay loop (tied to video frames)
    startOverlayLoop(video, canvas);

    // Start report sampler (throttled, updates React state)
    startReportSampler(video);

    // Listen for video end
    const onEnded = () => {
      video.removeEventListener('ended', onEnded);
      finishAnalysis();
    };
    video.addEventListener('ended', onEnded);
  }, [videoFile, videoUrl, loadModel, startOverlayLoop, startReportSampler, finishAnalysis]);

  const stopAnalysis = useCallback(() => {
    finishAnalysis();
  }, [finishAnalysis]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopLoops(); };
  }, [stopLoops]);

  const isAnalyzing = analysisState === 'analyzing' || analysisState === 'loading-model';

  const updateProfile = (patch: Partial<TaskProfile>) => {
    const p = { ...taskProfile, ...patch };
    setTaskProfile(p);
    taskProfileRef.current = p;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[oklch(0.25_0.04_240)] flex items-center justify-center">
          <Film className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Video Analysis</h1>
          <p className="text-sm text-muted-foreground">Upload a task video for automated ergonomic assessment</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: video (3/5) */}
        <div className="lg:col-span-3 space-y-3">
          {!videoFile ? (
            <div
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all min-h-[320px]
                ${isDragging ? 'border-sky-400 bg-sky-50' : 'border-border hover:border-sky-300 hover:bg-slate-50'}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('video-input')?.click()}
            >
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Drop your video here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse · MP4, MOV, WebM, AVI</p>
              </div>
              <input id="video-input" type="file" accept="video/*" className="hidden" onChange={handleInputChange} />
            </div>
          ) : (
            <div className="space-y-3">
              {/* File bar */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                <FileVideo className="w-5 h-5 text-sky-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{videoFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7"
                  onClick={() => { stopLoops(); setVideoFile(null); setVideoUrl(null); setAnalysisState('idle'); setLiveScores(null); }}
                  disabled={isAnalyzing}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/*
                VIDEO + CANVAS CONTAINER
                Video is ALWAYS visible (handles rotation correctly via browser CSS).
                Canvas is transparent overlay on top — only draws skeleton lines.
                During analysis: canvas visible (opacity 1), video controls hidden.
                Before/after: video visible with controls, canvas hidden (opacity 0).
              */}
              <div className="relative rounded-xl overflow-hidden bg-black w-full max-h-[70vh]" style={{ aspectRatio: videoAspect }}>
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ zIndex: 1, pointerEvents: isAnalyzing ? 'none' : 'auto' }}
                  controls={!isAnalyzing}
                  preload="auto"
                  playsInline
                  muted
                  onLoadedMetadata={e => {
                    const v = e.currentTarget;
                    if (v.videoWidth && v.videoHeight) {
                      setVideoAspect(`${v.videoWidth} / ${v.videoHeight}`);
                    }
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    zIndex: 2,
                    pointerEvents: 'none',
                    opacity: isAnalyzing ? 1 : 0,
                    background: 'transparent',
                  }}
                />

                {/* HUD — only during analysis */}
                {isAnalyzing && (
                  <>
                    {/* Bottom bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-6 pb-3 flex items-end gap-4" style={{ zIndex: 3 }}>
                      <div className="flex-1">
                        <div className="flex justify-between text-[11px] text-white/70 mb-1">
                          <span>{analysisState === 'loading-model' ? 'Loading model…' : `${framesAnalyzed} samples`}</span>
                          {liveScores && (
                            <span className="font-mono">
                              RULA <span className={liveScores.rula >= 5 ? 'text-red-400' : liveScores.rula >= 3 ? 'text-amber-400' : 'text-green-400'}>{liveScores.rula.toFixed(0)}</span>
                              {'  '}REBA <span className={liveScores.reba >= 8 ? 'text-red-400' : liveScores.reba >= 4 ? 'text-amber-400' : 'text-green-400'}>{liveScores.reba.toFixed(0)}</span>
                            </span>
                          )}
                        </div>
                        <Progress value={progress} className="h-0.5 bg-white/20" />
                      </div>
                      <Button size="sm"
                        className="h-7 px-3 bg-white/20 hover:bg-white/30 text-white border border-white/30 gap-1.5 text-xs shrink-0 font-semibold"
                        onClick={stopAnalysis}>
                        <StopCircle className="w-3.5 h-3.5" /> Stop &amp; Finish
                      </Button>
                    </div>

                    {/* Risk color toggle — top right */}
                    <button
                      className={`absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all shadow-md ${
                        riskColors
                          ? 'bg-white/90 text-slate-800 border border-white/60'
                          : 'bg-black/60 text-white/70 border border-white/20 hover:bg-black/80'
                      }`}
                      style={{ zIndex: 3 }}
                      onClick={() => setRiskColors(v => !v)}
                      title={riskColors ? 'Click to show plain skeleton' : 'Click to show risk colors'}
                    >
                      <span className={`w-2 h-2 rounded-full ${riskColors ? 'bg-green-500' : 'bg-slate-400'}`} />
                      {riskColors ? 'Risk Colors' : 'Plain'}
                    </button>
                  </>
                )}
              </div>

              {/* Result / error banners */}
              {analysisState === 'done' && resultId && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-800">Analysis complete</p>
                    <p className="text-xs text-green-700">{framesAnalyzed} samples collected</p>
                  </div>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    onClick={() => navigate(`/sessions/${resultId}`)}>
                    View Report <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {analysisState === 'error' && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Analysis failed</p>
                    <p className="text-xs text-red-700 mt-0.5">{errorMsg}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: controls (2/5) */}
        <div className="lg:col-span-2 space-y-3">
          <Button
            className="w-full gap-2 bg-sky-600 hover:bg-sky-700 text-white h-12 text-base font-semibold shadow-md"
            disabled={!videoFile || isAnalyzing}
            onClick={analyzeVideo}
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {analysisState === 'loading-model' ? 'Loading model…' : `Analyzing… ${progress}%`}
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                {videoFile ? 'Analyze Video' : 'Upload a video to begin'}
              </>
            )}
          </Button>

          <Card>
            <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setConfigOpen(o => !o)}>
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-sky-500" />
                  Task Configuration
                </span>
                {configOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            {configOpen && (
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-1.5">
                  <Label className="text-xs">Task Name</Label>
                  <Input value={taskProfile.taskName} onChange={e => updateProfile({ taskName: e.target.value })}
                    placeholder="e.g. Assembly Line Station 3" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Load Weight: <span className="font-semibold">{taskProfile.loadWeight} kg</span></Label>
                  <Slider value={[taskProfile.loadWeight]} onValueChange={([v]) => updateProfile({ loadWeight: v })}
                    min={0} max={50} step={0.5} className="py-1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Repetitions/min: <span className="font-semibold">{taskProfile.repRate}</span></Label>
                  <Slider value={[taskProfile.repRate]} onValueChange={([v]) => updateProfile({ repRate: v })}
                    min={1} max={60} step={1} className="py-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Duration</Label>
                    <Select value={taskProfile.duration} onValueChange={v => updateProfile({ duration: v as TaskProfile['duration'] })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short (&lt;1 hr)</SelectItem>
                        <SelectItem value="moderate">Moderate (1–2 hr)</SelectItem>
                        <SelectItem value="long">Long (&gt;2 hr)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Coupling</Label>
                    <Select value={taskProfile.coupling} onValueChange={v => updateProfile({ coupling: v as TaskProfile['coupling'] })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Assessment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1.5">
                <Label className="text-xs">Assessor Name</Label>
                <Input value={assessor} onChange={e => setAssessor(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department / Area</Label>
                <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Assembly, Warehouse" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location / Station</Label>
                <Input value={workLocation} onChange={e => setWorkLocation(e.target.value)} placeholder="e.g. Line 3, Bay 7" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reassessment of</Label>
                <Select value={baselineId || 'none'} onValueChange={v => setBaselineId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None (new assessment)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (new assessment)</SelectItem>
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.id} — {s.taskName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional reviewer notes" className="h-8 text-sm" />
              </div>
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground bg-slate-50 rounded-lg p-3 border space-y-1">
            <p className="font-semibold text-foreground">Tips for best results</p>
            <p>• Worker should fill at least 30% of the frame</p>
            <p>• Good lighting, avoid strong backlighting</p>
            <p>• Side or 45° angle works best; avoid directly behind</p>
            <p>• Full body visible (head to feet) gives most accurate scores</p>
          </div>
        </div>
      </div>
    </div>
  );
}
