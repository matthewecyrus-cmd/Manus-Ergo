/**
 * VideoUpload — ErgoKit
 * =====================
 * Design: Clinical Dashboard — deep navy sidebar, sky-blue accents, ISO risk colors
 *
 * CANVAS ARCHITECTURE:
 *   The canvas is ALWAYS in the DOM, ALWAYS has position:absolute inset-0,
 *   and is ALWAYS visible. We never use display:none on the canvas.
 *   - Before analysis: canvas is transparent (nothing drawn on it)
 *   - During analysis: canvas shows video frame + skeleton overlay
 *   - After analysis: canvas shows last frame + skeleton
 *
 *   The video element is ALWAYS visible underneath the canvas.
 *   - Before analysis: video shows normally with controls
 *   - During analysis: video is hidden via opacity:0 (stays in DOM for MediaPipe)
 *
 *   This ensures getBoundingClientRect() on the canvas always returns real dimensions
 *   because the canvas is always laid out in the document.
 *
 *   We use an offscreen canvas for drawImage to avoid CORS taint issues.
 */
import { useRef, useState, useCallback, useEffect, useContext } from 'react';
import { useLocation } from 'wouter';
import {
  Upload, Film, Play, CheckCircle2, AlertCircle,
  Settings2, ChevronRight, X, FileVideo, ChevronDown, ChevronUp
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
import {
  EMAFilter, computeSnapshot, riskLabel, summarizeSession,
} from '@/lib/ergo-engine';
import type { TaskProfile, ErgoSnapshot, SessionSource, SessionRecord } from '@/lib/ergo-engine';

// MediaPipe CDN
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

type AnalysisState = 'idle' | 'loading-model' | 'analyzing' | 'done' | 'error';

// ─── Per-joint risk coloring ────────────────────────────────────────────────
const UPPER_JOINTS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27],
  [24, 26], [26, 28],
  [15, 17], [15, 19], [17, 19],
  [16, 18], [16, 20], [18, 20],
  [0, 11], [0, 12],
];

function jointRiskColor(score: number, type: 'rula' | 'reba'): string {
  if (type === 'rula') {
    if (score >= 7) return '#ef4444';
    if (score >= 5) return '#f97316';
    if (score >= 3) return '#f59e0b';
    return '#22c55e';
  } else {
    if (score >= 11) return '#ef4444';
    if (score >= 8)  return '#f97316';
    if (score >= 4)  return '#f59e0b';
    return '#22c55e';
  }
}

/**
 * Draw video frame + skeleton onto the canvas.
 * The canvas must already be in the DOM and laid out (never display:none).
 * We read its rendered dimensions via getBoundingClientRect().
 */
function renderFrameWithSkeleton(
  canvas: HTMLCanvasElement,
  videoEl: HTMLVideoElement,
  lm: any[] | null,
  scores: { rula: number; reba: number } | null,
) {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;

  if (W < 10 || H < 10) {
    // Canvas not laid out yet — skip this frame
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const bufW = Math.round(W * dpr);
  const bufH = Math.round(H * dpr);

  // Only resize the buffer when dimensions actually change (avoids clearing mid-draw)
  if (canvas.width !== bufW || canvas.height !== bufH) {
    canvas.width  = bufW;
    canvas.height = bufH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── Draw video frame ──────────────────────────────────────────────────────
  try {
    ctx.drawImage(videoEl, 0, 0, W, H);
  } catch {
    // drawImage can throw if video is not ready — fill black instead
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }

  if (!lm || lm.length === 0) return;

  const CONF = 0.25;
  const rulaColor = scores ? jointRiskColor(scores.rula, 'rula') : '#22c55e';
  const rebaColor = scores ? jointRiskColor(scores.reba, 'reba') : '#22c55e';

  // ── Draw bones ──────────────────────────────────────────────────────────
  ctx.lineWidth = Math.max(2.5, W / 280);
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = lm[a], lb = lm[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 1) < CONF || (lb.visibility ?? 1) < CONF) continue;
    const isUpper = UPPER_JOINTS.has(a) || UPPER_JOINTS.has(b);
    const color = isUpper ? rulaColor : rebaColor;
    ctx.beginPath();
    ctx.moveTo(la.x * W, la.y * H);
    ctx.lineTo(lb.x * W, lb.y * H);
    ctx.strokeStyle = color + 'cc';
    ctx.stroke();
  }

  // ── Draw joints ─────────────────────────────────────────────────────────
  const r = Math.max(5, W / 120);
  for (let i = 0; i < lm.length; i++) {
    const pt = lm[i];
    if (!pt || (pt.visibility ?? 1) < CONF) continue;
    const x = pt.x * W;
    const y = pt.y * H;
    const isUpper = UPPER_JOINTS.has(i);
    const color = isUpper ? rulaColor : rebaColor;

    // Glow halo
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = color + '28';
    ctx.fill();

    // White ring
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();

    // Colored dot
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── Score badge ─────────────────────────────────────────────────────────
  if (scores) {
    const pad = 10;
    const bW = 140, bH = 40;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(pad, pad, bW, bH, 8);
    ctx.fill();
    ctx.font = `bold ${Math.max(12, W / 55)}px ui-monospace, monospace`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`RULA ${scores.rula.toFixed(0)}   REBA ${scores.reba.toFixed(0)}`, pad + 10, pad + 26);
  }
}

export default function VideoUpload() {
  const [, navigate] = useLocation();
  const { sessions, taskProfile, setTaskProfile } = useSession();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [progress, setProgress] = useState(0);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [liveScores, setLiveScores] = useState<{ rula: number; reba: number } | null>(null);

  const [assessor, setAssessor] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [configOpen, setConfigOpen] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<any>(null);
  const emaRef = useRef(new EMAFilter(0.25));
  const taskProfileRef = useRef<TaskProfile>(taskProfile);

  useEffect(() => { taskProfileRef.current = taskProfile; }, [taskProfile]);

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
    setFramesProcessed(0);
    setResultId(null);
    setErrorMsg(null);
    setLiveScores(null);
    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
    const opts = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' as const },
      runningMode: 'IMAGE' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.25,
      minPosePresenceConfidence: 0.25,
      minTrackingConfidence: 0.25,
    };
    try {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, opts);
    } catch {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        ...opts,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' as const },
      });
    }
  }, []);

  const sessionCtx = useContext(SessionContext);
  const addSession = useCallback((record: SessionRecord) => {
    if (sessionCtx) sessionCtx.addSession(record);
  }, [sessionCtx]);

  const analyzeVideo = useCallback(async () => {
    if (!videoFile || !videoUrl) return;
    setAnalysisState('loading-model');
    setErrorMsg(null);
    setLiveScores(null);

    try {
      await loadModel();
    } catch {
      setErrorMsg('Failed to load pose detection model. Check your internet connection.');
      setAnalysisState('error');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // ── Load video metadata ───────────────────────────────────────────────
    video.src = videoUrl;
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.load();

    await new Promise<void>((resolve, reject) => {
      const onMeta = () => { video.removeEventListener('loadeddata', onMeta); resolve(); };
      video.addEventListener('loadeddata', onMeta);
      video.onerror = () => reject(new Error('Video load failed'));
      setTimeout(() => reject(new Error('Video metadata timeout')), 20000);
    });

    const duration = video.duration;
    const SAMPLE_INTERVAL = Math.max(0.5, duration / 300);
    const frameCount = Math.floor(duration / SAMPLE_INTERVAL);
    setTotalFrames(frameCount);
    setAnalysisState('analyzing');
    emaRef.current.reset();

    const snapshots: ErgoSnapshot[] = [];
    let thumbnailDataUrl: string | undefined;
    let detectedCount = 0;

    for (let i = 0; i < frameCount; i++) {
      const t = i * SAMPLE_INTERVAL;
      video.currentTime = t;

      // Wait for the seek to complete
      await new Promise<void>(resolve => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
      });

      // ── CRITICAL: Read canvas dimensions AFTER seek (it's always in DOM) ──
      const rect = canvas.getBoundingClientRect();
      const W = rect.width > 10 ? rect.width : 640;
      const H = rect.height > 10 ? rect.height : 360;

      // Draw the current video frame onto the canvas (shows video while analyzing)
      renderFrameWithSkeleton(canvas, video, null, null);

      // Capture thumbnail at 25% mark
      if (i === Math.floor(frameCount * 0.25)) {
        thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      }

      // Run MediaPipe pose detection on the video element
      let result: any;
      try {
        result = poseLandmarkerRef.current.detect(video);
      } catch {
        setFramesProcessed(i + 1);
        setProgress(Math.round(((i + 1) / frameCount) * 100));
        continue;
      }

      if (result?.landmarks?.length > 0) {
        detectedCount++;
        const raw = result.landmarks[0];
        const smoothed = emaRef.current.smooth(raw);
        const snap = computeSnapshot(smoothed, taskProfileRef.current);
        if (snap) {
          snapshots.push({ ...snap, timestamp: t * 1000, landmarks: smoothed });
          const scores = { rula: snap.rula.score, reba: snap.reba.score };
          setLiveScores(scores);
          // Redraw frame with skeleton overlay
          renderFrameWithSkeleton(canvas, video, smoothed, scores);
        }
      }

      setFramesProcessed(i + 1);
      setProgress(Math.round(((i + 1) / frameCount) * 100));

      // Yield to the browser every 5 frames to allow React to re-render
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    if (snapshots.length === 0) {
      const hint = detectedCount === 0
        ? 'No person detected. Tips: ensure the worker fills at least 30% of the frame, use good lighting, and avoid extreme side angles.'
        : 'Person detected but pose could not be computed. Try a video with a clearer view of the full body.';
      setErrorMsg(hint);
      setAnalysisState('error');
      return;
    }

    const record = summarizeSession(
      snapshots,
      taskProfileRef.current,
      Math.round(duration),
      'video-upload' as SessionSource,
      {
        assessor: assessor || undefined,
        department: department || undefined,
        location: location || undefined,
        notes: notes || undefined,
        thumbnailDataUrl,
      },
    );

    if (baselineId) (record as any).baselineSessionId = baselineId;
    (record as any).videoUrl = videoUrl;

    addSession(record);
    setResultId(record.id);
    setAnalysisState('done');
    toast.success('Analysis complete!', {
      description: `${snapshots.length} frames analyzed · Peak risk: ${riskLabel(record.peakRisk)}`,
      action: { label: 'View Report', onClick: () => navigate(`/sessions/${record.id}`) },
    });
  }, [videoFile, videoUrl, loadModel, assessor, department, location, notes, baselineId, addSession, navigate]);

  const isAnalyzing = analysisState === 'analyzing' || analysisState === 'loading-model';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
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
        {/* ── Left: Video preview (3/5 width) ──────────────────────────────── */}
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
              {/* File info bar */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                <FileVideo className="w-5 h-5 text-sky-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{videoFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <Button
                  variant="ghost" size="icon" className="shrink-0 h-7 w-7"
                  onClick={() => {
                    setVideoFile(null);
                    setVideoUrl(null);
                    setAnalysisState('idle');
                    setLiveScores(null);
                  }}
                  disabled={isAnalyzing}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/*
                ── Video + Canvas container ──────────────────────────────────────
                ARCHITECTURE:
                  - Container: relative, aspect-video, bg-black, overflow-hidden
                  - Video: absolute inset-0, always in DOM, opacity controlled
                  - Canvas: absolute inset-0, ALWAYS visible (never display:none)
                    The canvas is transparent when nothing is drawn.
                    During analysis it shows the video frame + skeleton.
                    After analysis it shows the last frame + skeleton.
                  - Progress HUD: absolute bottom-0, z-index above canvas

                WHY: getBoundingClientRect() on the canvas returns real dimensions
                only when the canvas is in the layout flow. display:none removes it
                from layout, causing rect.width=0 and breaking coordinate math.
              */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                {/* Video element — always in DOM, hidden during analysis */}
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{
                    opacity: isAnalyzing ? 0 : 1,
                    zIndex: 1,
                    // Keep in layout flow even when hidden
                    pointerEvents: isAnalyzing ? 'none' : 'auto',
                  }}
                  controls={!isAnalyzing}
                  preload="auto"
                />

                {/*
                  Canvas — ALWAYS visible, ALWAYS in DOM, ALWAYS laid out.
                  Transparent when not analyzing (video shows through).
                  During analysis: shows video frame + skeleton overlay.
                  pointer-events:none so video controls still work.
                */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    zIndex: 2,
                    pointerEvents: 'none',
                    // Transparent when not analyzing — video is visible underneath
                    opacity: isAnalyzing ? 1 : 0,
                  }}
                />

                {/* Progress HUD — only during analysis */}
                {isAnalyzing && (
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-black/75 px-4 py-2.5 flex items-center gap-4"
                    style={{ zIndex: 3 }}
                  >
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-white/80 mb-1">
                        <span>
                          {analysisState === 'loading-model'
                            ? 'Loading AI model…'
                            : `Frame ${framesProcessed} / ${totalFrames}`}
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                    {liveScores && (
                      <div className="flex gap-3 text-xs font-mono shrink-0">
                        <span className="text-white/60">
                          RULA{' '}
                          <span className={`font-bold ${liveScores.rula >= 5 ? 'text-red-400' : liveScores.rula >= 3 ? 'text-amber-400' : 'text-green-400'}`}>
                            {liveScores.rula.toFixed(0)}
                          </span>
                        </span>
                        <span className="text-white/60">
                          REBA{' '}
                          <span className={`font-bold ${liveScores.reba >= 8 ? 'text-red-400' : liveScores.reba >= 4 ? 'text-amber-400' : 'text-green-400'}`}>
                            {liveScores.reba.toFixed(0)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Result / error banners */}
              {analysisState === 'done' && resultId && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-800">Analysis complete</p>
                    <p className="text-xs text-green-700">{framesProcessed} frames analyzed · Session ID: {resultId}</p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    onClick={() => navigate(`/sessions/${resultId}`)}
                  >
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

        {/* ── Right: Analyze button + config (2/5 width) ────────────────────── */}
        <div className="lg:col-span-2 space-y-3">

          {/* ★ ANALYZE BUTTON — always at top ★ */}
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

          {/* Task Configuration */}
          <Card>
            <CardHeader
              className="pb-2 cursor-pointer select-none"
              onClick={() => setConfigOpen(o => !o)}
            >
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-sky-500" />
                  Task Configuration
                </span>
                {configOpen
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            {configOpen && (
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-1.5">
                  <Label className="text-xs">Task Name</Label>
                  <Input
                    value={taskProfile.taskName}
                    onChange={e => {
                      const p = { ...taskProfile, taskName: e.target.value };
                      setTaskProfile(p);
                      taskProfileRef.current = p;
                    }}
                    placeholder="e.g. Assembly Line Station 3"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Load Weight: <span className="font-semibold">{taskProfile.loadWeight} kg</span>
                  </Label>
                  <Slider
                    value={[taskProfile.loadWeight]}
                    onValueChange={([v]) => {
                      const p = { ...taskProfile, loadWeight: v };
                      setTaskProfile(p);
                      taskProfileRef.current = p;
                    }}
                    min={0} max={50} step={0.5} className="py-1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Repetitions/min: <span className="font-semibold">{taskProfile.repRate}</span>
                  </Label>
                  <Slider
                    value={[taskProfile.repRate]}
                    onValueChange={([v]) => {
                      const p = { ...taskProfile, repRate: v };
                      setTaskProfile(p);
                      taskProfileRef.current = p;
                    }}
                    min={1} max={60} step={1} className="py-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Duration</Label>
                    <Select
                      value={taskProfile.duration}
                      onValueChange={v => {
                        const p = { ...taskProfile, duration: v as TaskProfile['duration'] };
                        setTaskProfile(p);
                        taskProfileRef.current = p;
                      }}
                    >
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
                    <Select
                      value={taskProfile.coupling}
                      onValueChange={v => {
                        const p = { ...taskProfile, coupling: v as TaskProfile['coupling'] };
                        setTaskProfile(p);
                        taskProfileRef.current = p;
                      }}
                    >
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

          {/* Assessment Metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Assessment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1.5">
                <Label className="text-xs">Assessor Name</Label>
                <Input
                  value={assessor}
                  onChange={e => setAssessor(e.target.value)}
                  placeholder="Optional"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department / Area</Label>
                <Input
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. Assembly, Warehouse"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location / Station</Label>
                <Input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Line 3, Bay 7"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reassessment of</Label>
                <Select
                  value={baselineId || 'none'}
                  onValueChange={v => setBaselineId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="None (new assessment)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (new assessment)</SelectItem>
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.id} — {s.taskName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional reviewer notes"
                  className="h-8 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Detection tips */}
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
