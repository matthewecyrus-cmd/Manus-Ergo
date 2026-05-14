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
import { useRef, useState, useCallback, useContext, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Upload, Film, Play, CheckCircle2, AlertCircle,
  Settings2, ChevronRight, X, FileVideo, ChevronDown, ChevronUp,
  Pause, Square
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
import { EMAFilter, computeSnapshot, riskLabel, summarizeSession, extractAngles } from '@/lib/ergo-engine';
import type { TaskProfile, ErgoSnapshot, SessionSource, SessionRecord, BodyAngles } from '@/lib/ergo-engine';

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
  { a:0,  b:11, seg:'neck' },   { a:0,  b:12, seg:'neck' },
  { a:11, b:12, seg:'trunk' },  { a:11, b:23, seg:'trunk' },
  { a:12, b:24, seg:'trunk' },  { a:23, b:24, seg:'trunk' },
  { a:11, b:13, seg:'upperArm' }, { a:12, b:14, seg:'upperArm' },
  { a:13, b:15, seg:'lowerArm' }, { a:14, b:16, seg:'lowerArm' },
  { a:15, b:17, seg:'wrist' },  { a:15, b:19, seg:'wrist' },
  { a:17, b:19, seg:'wrist' },  { a:16, b:18, seg:'wrist' },
  { a:16, b:20, seg:'wrist' },  { a:18, b:20, seg:'wrist' },
  { a:23, b:25, seg:'legs' },   { a:25, b:27, seg:'legs' },
  { a:24, b:26, seg:'legs' },   { a:26, b:28, seg:'legs' },
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
function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  video: HTMLVideoElement,
  landmarks: any[],
  riskColors: boolean,
  segColors: SegColors | null,
) {
  const vW = video.videoWidth  || W;
  const vH = video.videoHeight || H;
  const scale = Math.min(W / vW, H / vH);
  const drawW = vW * scale;
  const drawH = vH * scale;
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
  const [riskColors, setRiskColors] = useState(false);
  const [framesAnalyzed, setFramesAnalyzed] = useState(0);

  const [assessor, setAssessor] = useState('');
  const [department, setDepartment] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [configOpen, setConfigOpen] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<any>(null);
  const emaRef = useRef(new EMAFilter(0.5));
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
    (record as any).videoUrl = videoUrl;

    addSession(record);
    setResultId(record.id);
    setAnalysisState('done');
    setProgress(100);
    toast.success('Analysis complete!', {
      description: `${snapshots.length} samples · Peak risk: ${riskLabel(record.peakRisk)}`,
      action: { label: 'View Report', onClick: () => navigate(`/sessions/${record.id}`) },
    });
  }, [stopLoops, assessor, department, workLocation, notes, baselineId, videoUrl, addSession, navigate]);

  const startOverlayLoop = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawFrame = (timestampMs: number) => {
      if (!isRunningRef.current) return;

      const W = canvas.width;
      const H = canvas.height;
      if (W < 4 || H < 4) return;

      // Draw video frame
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      try { ctx.drawImage(video, 0, 0, W, H); } catch { /* not ready */ }

      // Run MediaPipe VIDEO mode with actual video timestamp
      if (poseLandmarkerRef.current && !video.paused && !video.ended) {
        try {
          const result = poseLandmarkerRef.current.detectForVideo(video, timestampMs);
          if (result?.landmarks?.length > 0) {
            const raw = result.landmarks[0];
            const smoothed = emaRef.current.smooth(raw);
            latestLandmarksRef.current = smoothed;

            // Compute segment colors (cheap — just angle math)
            const { angles } = extractAngles(smoothed);
            latestSegColorsRef.current = getSegmentColors(angles);
          } else {
            latestLandmarksRef.current = null;
            latestSegColorsRef.current = null;
          }
        } catch { /* skip frame */ }
      }

      // Draw skeleton overlay
      const lm = latestLandmarksRef.current;
      if (lm && lm.length > 0) {
        // Correct letterbox mapping
        const vW = video.videoWidth  || W;
        const vH = video.videoHeight || H;
        const scale = Math.min(W / vW, H / vH);
        const drawW = vW * scale;
        const drawH = vH * scale;
        const drawX = (W - drawW) / 2;
        const drawY = (H - drawH) / 2;

        // Redraw video into letterbox rect (correct aspect ratio)
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        try { ctx.drawImage(video, drawX, drawY, drawW, drawH); } catch { /* skip */ }

        drawSkeleton(ctx, W, H, video, lm, riskColorsRef.current, latestSegColorsRef.current);
      } else {
        // No skeleton — just draw video correctly letterboxed
        const vW = video.videoWidth  || W;
        const vH = video.videoHeight || H;
        const scale = Math.min(W / vW, H / vH);
        const drawW = vW * scale;
        const drawH = vH * scale;
        const drawX = (W - drawW) / 2;
        const drawY = (H - drawH) / 2;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        try { ctx.drawImage(video, drawX, drawY, drawW, drawH); } catch { /* skip */ }
      }

      // Capture thumbnail at 25% of video
      if (!thumbnailCapturedRef.current && video.duration > 0 && video.currentTime >= video.duration * 0.25) {
        thumbnailCapturedRef.current = true;
        thumbnailDataUrlRef.current = canvas.toDataURL('image/jpeg', 0.7);
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
    // Sample at 500ms intervals — update React state and collect snapshots
    reportIntervalRef.current = setInterval(() => {
      if (!isRunningRef.current || video.paused || video.ended) return;

      const lm = latestLandmarksRef.current;
      if (!lm) return;

      const now = Date.now();
      if (now - lastReportTimeRef.current < 450) return; // debounce
      lastReportTimeRef.current = now;

      const snap = computeSnapshot(lm, taskProfileRef.current);
      if (snap) {
        snapshotsRef.current.push({ ...snap, timestamp: video.currentTime * 1000, landmarks: lm });
        setFramesAnalyzed(n => n + 1);
        setLiveScores({ rula: snap.rula.score, reba: snap.reba.score });
        if (video.duration > 0) {
          setProgress(Math.round((video.currentTime / video.duration) * 100));
        }
      }
    }, 500);
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
                canvas is always in DOM (never display:none) — opacity toggle only
                During analysis: canvas on top (opacity 1), video hidden (opacity 0)
                Before/after: video visible with controls, canvas hidden
              */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{
                    zIndex: 1,
                    opacity: isAnalyzing ? 0 : 1,
                    pointerEvents: isAnalyzing ? 'none' : 'auto',
                  }}
                  controls={!isAnalyzing}
                  preload="auto"
                  playsInline
                  muted
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    zIndex: 2,
                    pointerEvents: 'none',
                    opacity: isAnalyzing ? 1 : 0,
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
                      <Button size="sm" variant="ghost"
                        className="h-7 px-2 text-white/70 hover:text-white hover:bg-white/10 gap-1 text-xs shrink-0"
                        onClick={stopAnalysis}>
                        <Square className="w-3 h-3" /> Finish
                      </Button>
                    </div>

                    {/* Risk color toggle — top right */}
                    <button
                      className={`absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-mono transition-colors ${riskColors ? 'bg-sky-500/80 text-white' : 'bg-black/50 text-white/60 hover:bg-black/70'}`}
                      style={{ zIndex: 3 }}
                      onClick={() => setRiskColors(v => !v)}
                    >
                      {riskColors ? '● Risk colors ON' : '○ Risk colors'}
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
