/**
 * VideoUpload — ErgoKit
 * =====================
 * Design: Clinical Dashboard — deep navy sidebar, sky-blue accents, ISO risk colors
 *
 * CRITICAL FIX — Skeleton overlay coordinate math:
 *   The canvas is always visible (not display:none) so getBoundingClientRect() returns
 *   real dimensions. The canvas buffer is sized to the canvas element's rendered pixel
 *   dimensions (DPR-aware). Landmark coords (0–1 normalized) are multiplied by those
 *   dimensions, so joints land precisely on the person's body.
 *
 *   The video element uses opacity:0 + position:absolute during analysis (NOT display:none)
 *   so it stays in the layout flow and the canvas can overlay it correctly.
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
  EMAFilter, computeSnapshot, DEFAULT_TASK_PROFILE,
  riskLabel,
  summarizeSession,
} from '@/lib/ergo-engine';
import type { TaskProfile, ErgoSnapshot, SessionSource, SessionRecord } from '@/lib/ergo-engine';

// MediaPipe CDN
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

type AnalysisState = 'idle' | 'loading-model' | 'analyzing' | 'done' | 'error';

// ─── Per-joint risk coloring ────────────────────────────────────────────────
// Joint indices that contribute to upper-limb risk (RULA-sensitive)
const UPPER_JOINTS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
// Joint indices that contribute to trunk/lower-body risk (REBA-sensitive)
const LOWER_JOINTS = new Set([23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);

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

function riskColor(score: number, type: 'rula' | 'reba'): string {
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

function drawSkeleton(
  canvas: HTMLCanvasElement,
  lm: any[],
  scores: { rula: number; reba: number } | null,
) {
  // Use the canvas element's RENDERED pixel size (not its buffer size)
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = rect.width;
  const H = rect.height;

  if (W === 0 || H === 0) return;

  // Size the canvas buffer to the rendered size × DPR for sharp rendering
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const CONF = 0.25;
  const rulaColor = scores ? riskColor(scores.rula, 'rula') : '#22c55e';
  const rebaColor = scores ? riskColor(scores.reba, 'reba') : '#22c55e';

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

    // White outline ring
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();

    // Colored fill
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── Score badge ─────────────────────────────────────────────────────────
  if (scores) {
    const pad = 10;
    const bW = 130, bH = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath();
    ctx.roundRect(pad, pad, bW, bH, 7);
    ctx.fill();
    ctx.font = `bold ${Math.max(12, W / 55)}px ui-monospace, monospace`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`RULA ${scores.rula.toFixed(0)}   REBA ${scores.reba.toFixed(0)}`, pad + 10, pad + 25);
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
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, { ...opts, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' as const } });
    }
  }, []);

  const ctx = useContext(SessionContext);
  const addSession = useCallback((record: SessionRecord) => {
    if (ctx) ctx.addSession(record);
  }, [ctx]);

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

    video.src = videoUrl;
    video.muted = true;
    video.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video load failed'));
      setTimeout(() => reject(new Error('Video metadata timeout')), 15000);
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

      await new Promise<void>(resolve => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
      });

      // ── Get canvas rendered dimensions (canvas is always visible, rect is always valid) ──
      const canvasRect = canvas.getBoundingClientRect();
      const W = canvasRect.width  > 10 ? canvasRect.width  : 800;
      const H = canvasRect.height > 10 ? canvasRect.height : 450;
      const dpr = window.devicePixelRatio || 1;

      // Size canvas buffer to rendered size × DPR
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);

      const c2d = canvas.getContext('2d');
      if (c2d) {
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Draw the video frame scaled to fill the canvas display area
        c2d.drawImage(video, 0, 0, W, H);
      }

      // Capture thumbnail at 25% mark
      if (i === Math.floor(frameCount * 0.25) && c2d) {
        thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      }

      // Run MediaPipe in IMAGE mode (works on seeked frames)
      let result: any;
      try {
        result = poseLandmarkerRef.current.detect(video);
      } catch { continue; }

      if (result?.landmarks?.length > 0) {
        detectedCount++;
        const raw = result.landmarks[0];
        const smoothed = emaRef.current.smooth(raw);
        const snap = computeSnapshot(smoothed, taskProfileRef.current);
        if (snap) {
          snapshots.push({ ...snap, timestamp: t * 1000, landmarks: smoothed });
          const scores = { rula: snap.rula.score, reba: snap.reba.score };
          setLiveScores(scores);

          // Redraw video frame then overlay skeleton
          if (c2d) {
            c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
            c2d.drawImage(video, 0, 0, W, H);
          }
          drawSkeleton(canvas, smoothed, scores);
        }
      }

      setFramesProcessed(i + 1);
      setProgress(Math.round(((i + 1) / frameCount) * 100));

      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    if (snapshots.length === 0) {
      const hint = detectedCount === 0
        ? 'No person detected. Tips: ensure the worker fills at least 30% of the frame, use good lighting, and avoid extreme side angles where the body is mostly occluded.'
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
                  onClick={() => { setVideoFile(null); setVideoUrl(null); setAnalysisState('idle'); setLiveScores(null); }}
                  disabled={isAnalyzing}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* ── Video + canvas overlay container ────────────────────────── */}
              {/*
                CRITICAL: The video element MUST stay in the DOM and be visible (not display:none)
                during analysis so that:
                  1. getBoundingClientRect() on the canvas returns real dimensions
                  2. MediaPipe can read the video frame via detect(video)
                We use opacity:0 + absolute positioning to hide it visually while keeping it
                in layout flow. The canvas sits on top with the video frame drawn onto it.
              */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                {/* Video — always in DOM, hidden behind canvas during analysis */}
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  className="w-full h-full object-contain"
                  style={{
                    opacity: isAnalyzing ? 0 : 1,
                    position: isAnalyzing ? 'absolute' : 'relative',
                    inset: 0,
                    zIndex: 1,
                  }}
                  controls={!isAnalyzing}
                  preload="metadata"
                />

                {/* Canvas — always rendered so its rect is always valid */}
                <canvas
                  ref={canvasRef}
                  className="w-full h-full"
                  style={{
                    display: isAnalyzing ? 'block' : 'none',
                    position: 'absolute',
                    inset: 0,
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                />

                {/* Progress HUD */}
                {isAnalyzing && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-4 py-2.5 flex items-center gap-4" style={{ zIndex: 3 }}>
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
                        <span className="text-white/60">RULA <span className={`font-bold ${liveScores.rula >= 5 ? 'text-red-400' : liveScores.rula >= 3 ? 'text-amber-400' : 'text-green-400'}`}>{liveScores.rula.toFixed(0)}</span></span>
                        <span className="text-white/60">REBA <span className={`font-bold ${liveScores.reba >= 8 ? 'text-red-400' : liveScores.reba >= 4 ? 'text-amber-400' : 'text-green-400'}`}>{liveScores.reba.toFixed(0)}</span></span>
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
                  <Input
                    value={taskProfile.taskName}
                    onChange={e => { const p = { ...taskProfile, taskName: e.target.value }; setTaskProfile(p); taskProfileRef.current = p; }}
                    placeholder="e.g. Assembly Line Station 3"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Load Weight: <span className="font-semibold">{taskProfile.loadWeight} kg</span></Label>
                  <Slider value={[taskProfile.loadWeight]}
                    onValueChange={([v]) => { const p = { ...taskProfile, loadWeight: v }; setTaskProfile(p); taskProfileRef.current = p; }}
                    min={0} max={50} step={0.5} className="py-1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Repetitions/min: <span className="font-semibold">{taskProfile.repRate}</span></Label>
                  <Slider value={[taskProfile.repRate]}
                    onValueChange={([v]) => { const p = { ...taskProfile, repRate: v }; setTaskProfile(p); taskProfileRef.current = p; }}
                    min={1} max={60} step={1} className="py-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Duration</Label>
                    <Select value={taskProfile.duration}
                      onValueChange={v => { const p = { ...taskProfile, duration: v as TaskProfile['duration'] }; setTaskProfile(p); taskProfileRef.current = p; }}>
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
                    <Select value={taskProfile.coupling}
                      onValueChange={v => { const p = { ...taskProfile, coupling: v as TaskProfile['coupling'] }; setTaskProfile(p); taskProfileRef.current = p; }}>
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
                <Input value={assessor} onChange={e => setAssessor(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department / Area</Label>
                <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Assembly, Warehouse" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location / Station</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Line 3, Bay 7" className="h-8 text-sm" />
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
