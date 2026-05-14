/**
 * VideoUpload — ErgoKit
 * =====================
 * Design: Clinical Dashboard — deep navy sidebar, sky-blue accents, ISO risk colors
 *
 * CANVAS RENDERING:
 *   canvas.width = canvas.offsetWidth  (CSS pixels, no DPR — avoids double-scale bug)
 *   canvas.height = canvas.offsetHeight
 *   Letterbox rect: scale = min(canvasW/videoW, canvasH/videoH)
 *   Landmark mapping: x = drawX + lm.x * drawW,  y = drawY + lm.y * drawH
 *
 * PLAYBACK PACING:
 *   The analysis loop seeks frame-by-frame. Without pacing, a 30s video plays in ~3s.
 *   We record wallClockStart and videoTimeStart at analysis begin.
 *   After each frame, we compute:
 *     videoElapsed = currentTime - videoTimeStart
 *     wallElapsed  = Date.now() - wallClockStart
 *     delay = max(0, videoElapsed * 1000 - wallElapsed)
 *   Then await setTimeout(delay) to pace display to real-time.
 *
 * SKELETON COLORS — per body segment, stoplight:
 *   Each segment is colored by its own component score from RULA/REBA:
 *     neck/head  → neck component score
 *     trunk      → trunk component score
 *     upper arms → upperArm component score
 *     lower arms → lowerArm component score
 *     wrists     → wristScore component
 *     legs       → legs component score
 *   Color scale: 1=green, 2=yellow, 3=orange, 4+=red
 *   Lines are thin (1.5px), clean, no glow halos.
 */
import { useRef, useState, useCallback, useContext } from 'react';
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
import { EMAFilter, computeSnapshot, riskLabel, summarizeSession } from '@/lib/ergo-engine';
import type { TaskProfile, ErgoSnapshot, SessionSource, SessionRecord } from '@/lib/ergo-engine';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

type AnalysisState = 'idle' | 'loading-model' | 'analyzing' | 'done' | 'error';

// ─── Stoplight color by component score ──────────────────────────────────────
// RULA/REBA component scores are 1–4+
// 1 = green (safe), 2 = yellow (caution), 3 = orange (warning), 4+ = red (danger)
function segmentColor(componentScore: number): string {
  if (componentScore >= 4) return '#ef4444'; // red
  if (componentScore >= 3) return '#f97316'; // orange
  if (componentScore >= 2) return '#eab308'; // yellow
  return '#22c55e';                           // green
}

// ─── Body segment groups ──────────────────────────────────────────────────────
// Each connection is tagged with which component score to use for coloring
// Components from RULA: upperArm, lowerArm, wrist, neck, trunk
// Components from REBA: neck, trunk, legs, upperArm, lowerArm, wristScore

interface SegmentedConnection {
  a: number;
  b: number;
  segment: 'neck' | 'trunk' | 'upperArm' | 'lowerArm' | 'wrist' | 'legs';
}

const SEGMENTED_CONNECTIONS: SegmentedConnection[] = [
  // Head / neck
  { a: 0,  b: 11, segment: 'neck' },
  { a: 0,  b: 12, segment: 'neck' },
  // Shoulders (trunk)
  { a: 11, b: 12, segment: 'trunk' },
  // Spine / trunk
  { a: 11, b: 23, segment: 'trunk' },
  { a: 12, b: 24, segment: 'trunk' },
  { a: 23, b: 24, segment: 'trunk' },
  // Upper arms
  { a: 11, b: 13, segment: 'upperArm' },
  { a: 12, b: 14, segment: 'upperArm' },
  // Lower arms
  { a: 13, b: 15, segment: 'lowerArm' },
  { a: 14, b: 16, segment: 'lowerArm' },
  // Wrists / hands
  { a: 15, b: 17, segment: 'wrist' },
  { a: 15, b: 19, segment: 'wrist' },
  { a: 17, b: 19, segment: 'wrist' },
  { a: 16, b: 18, segment: 'wrist' },
  { a: 16, b: 20, segment: 'wrist' },
  { a: 18, b: 20, segment: 'wrist' },
  // Legs
  { a: 23, b: 25, segment: 'legs' },
  { a: 25, b: 27, segment: 'legs' },
  { a: 24, b: 26, segment: 'legs' },
  { a: 26, b: 28, segment: 'legs' },
];

// Joint → which segment it belongs to (for dot coloring)
const JOINT_SEGMENT: Record<number, SegmentedConnection['segment']> = {
  0: 'neck', 1: 'neck', 2: 'neck', 3: 'neck', 4: 'neck', 5: 'neck', 6: 'neck', 7: 'neck', 8: 'neck',
  9: 'neck', 10: 'neck',
  11: 'trunk', 12: 'trunk',
  13: 'upperArm', 14: 'upperArm',
  15: 'lowerArm', 16: 'lowerArm',
  17: 'wrist', 18: 'wrist', 19: 'wrist', 20: 'wrist', 21: 'wrist', 22: 'wrist',
  23: 'trunk', 24: 'trunk',
  25: 'legs', 26: 'legs', 27: 'legs', 28: 'legs', 29: 'legs', 30: 'legs', 31: 'legs', 32: 'legs',
};

// ─── Per-segment color map from snapshot components ───────────────────────────
interface SegmentColors {
  neck: string;
  trunk: string;
  upperArm: string;
  lowerArm: string;
  wrist: string;
  legs: string;
}

function buildSegmentColors(snap: ErgoSnapshot): SegmentColors {
  const r = snap.rula.components;
  const b = snap.reba.components;
  return {
    neck:     segmentColor(Math.max(r.neck     ?? 1, b.neck     ?? 1)),
    trunk:    segmentColor(Math.max(r.trunk    ?? 1, b.trunk    ?? 1)),
    upperArm: segmentColor(Math.max(r.upperArm ?? 1, b.upperArm ?? 1)),
    lowerArm: segmentColor(Math.max(r.lowerArm ?? 1, b.lowerArm ?? 1)),
    wrist:    segmentColor(Math.max(r.wrist    ?? 1, b.wristScore ?? 1)),
    legs:     segmentColor(b.legs ?? 1),
  };
}

// ─── Canvas draw function ─────────────────────────────────────────────────────
function drawFrameOnCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: any[] | null,
  segColors: SegmentColors | null,
) {
  const W = canvas.width;
  const H = canvas.height;
  if (W < 4 || H < 4) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fill black (letterbox bars)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Letterbox rect — preserves video aspect ratio
  const vW = video.videoWidth  || W;
  const vH = video.videoHeight || H;
  const scale = Math.min(W / vW, H / vH);
  const drawW = vW * scale;
  const drawH = vH * scale;
  const drawX = (W - drawW) / 2;
  const drawY = (H - drawH) / 2;

  // Draw video frame
  try {
    ctx.drawImage(video, drawX, drawY, drawW, drawH);
  } catch {
    return; // video not ready
  }

  if (!landmarks || landmarks.length === 0 || !segColors) return;

  // Map landmark (0–1 in video space) → canvas pixel
  const px = (nx: number) => drawX + nx * drawW;
  const py = (ny: number) => drawY + ny * drawH;

  const CONF = 0.3;

  // ── Draw bones — thin, clean lines ────────────────────────────────────
  ctx.lineWidth = Math.max(1.5, drawW / 400);
  ctx.lineCap = 'round';

  for (const conn of SEGMENTED_CONNECTIONS) {
    const la = landmarks[conn.a];
    const lb = landmarks[conn.b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 1) < CONF || (lb.visibility ?? 1) < CONF) continue;

    ctx.beginPath();
    ctx.moveTo(px(la.x), py(la.y));
    ctx.lineTo(px(lb.x), py(lb.y));
    ctx.strokeStyle = segColors[conn.segment];
    ctx.stroke();
  }

  // ── Draw joints — small solid dots, no halos ──────────────────────────
  const r = Math.max(3, drawW / 200);

  for (let i = 0; i < landmarks.length; i++) {
    const pt = landmarks[i];
    if (!pt || (pt.visibility ?? 1) < CONF) continue;
    const x = px(pt.x);
    const y = py(pt.y);
    const seg = JOINT_SEGMENT[i] ?? 'trunk';
    const color = segColors[seg];

    // Thin white outline for visibility against any background
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    // Colored dot
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
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
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [liveScores, setLiveScores] = useState<{ rula: number; reba: number } | null>(null);

  const [assessor, setAssessor] = useState('');
  const [department, setDepartment] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [configOpen, setConfigOpen] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<any>(null);
  const emaRef = useRef(new EMAFilter(0.25));
  const taskProfileRef = useRef<TaskProfile>(taskProfile);

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
    const base = { modelAssetPath: MODEL_URL };
    try {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { ...base, delegate: 'GPU' as const },
        runningMode: 'IMAGE' as const, numPoses: 1,
        minPoseDetectionConfidence: 0.25, minPosePresenceConfidence: 0.25, minTrackingConfidence: 0.25,
      });
    } catch {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { ...base, delegate: 'CPU' as const },
        runningMode: 'IMAGE' as const, numPoses: 1,
        minPoseDetectionConfidence: 0.25, minPosePresenceConfidence: 0.25, minTrackingConfidence: 0.25,
      });
    }
  }, []);

  const sessionCtx = useContext(SessionContext);
  const addSession = useCallback((record: SessionRecord) => {
    sessionCtx?.addSession(record);
  }, [sessionCtx]);

  const analyzeVideo = useCallback(async () => {
    if (!videoFile || !videoUrl) return;
    setAnalysisState('loading-model');
    setErrorMsg(null);
    setLiveScores(null);

    try { await loadModel(); } catch {
      setErrorMsg('Failed to load pose detection model. Check your internet connection.');
      setAnalysisState('error');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Size canvas buffer to CSS pixel dimensions (no DPR — avoids double-scale bug)
    const syncCanvasSize = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w > 4 && h > 4) { canvas.width = w; canvas.height = h; }
    };
    syncCanvasSize();

    // Load video
    video.src = videoUrl;
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.load();

    await new Promise<void>((resolve, reject) => {
      const onReady = () => { video.removeEventListener('loadeddata', onReady); resolve(); };
      video.addEventListener('loadeddata', onReady);
      video.onerror = () => reject(new Error('Video load failed'));
      setTimeout(() => reject(new Error('Video timeout')), 20000);
    });

    syncCanvasSize();

    const duration = video.duration;
    // Sample every 0.5s (max 120 frames for very long videos)
    const SAMPLE_INTERVAL = Math.max(0.5, duration / 120);
    const frameCount = Math.floor(duration / SAMPLE_INTERVAL);
    setTotalFrames(frameCount);
    setAnalysisState('analyzing');
    emaRef.current.reset();

    const snapshots: ErgoSnapshot[] = [];
    let thumbnailDataUrl: string | undefined;
    let detectedCount = 0;

    // ── Playback pacing ────────────────────────────────────────────────────
    // We pace the canvas updates to real-time so the video doesn't appear
    // to play at 3x speed. After each frame we delay by:
    //   max(0, videoElapsedMs - wallElapsedMs)
    // This makes the display advance at 1x video speed.
    const wallClockStart = Date.now();
    const videoTimeStart = 0;

    for (let i = 0; i < frameCount; i++) {
      const videoTime = i * SAMPLE_INTERVAL;
      video.currentTime = videoTime;

      // Wait for seek
      await new Promise<void>(resolve => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
      });

      // Draw video frame (no skeleton yet)
      drawFrameOnCanvas(canvas, video, null, null);

      // Capture thumbnail at 25%
      if (i === Math.floor(frameCount * 0.25)) {
        thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      }

      // Run MediaPipe
      let result: any;
      try { result = poseLandmarkerRef.current.detect(video); } catch { /* skip */ }

      let segColors: SegmentColors | null = null;

      if (result?.landmarks?.length > 0) {
        detectedCount++;
        const raw = result.landmarks[0];
        const smoothed = emaRef.current.smooth(raw);
        const snap = computeSnapshot(smoothed, taskProfileRef.current);
        if (snap) {
          snapshots.push({ ...snap, timestamp: videoTime * 1000, landmarks: smoothed });
          segColors = buildSegmentColors(snap);
          setLiveScores({ rula: snap.rula.score, reba: snap.reba.score });
          drawFrameOnCanvas(canvas, video, smoothed, segColors);
        }
      }

      setFramesProcessed(i + 1);
      setProgress(Math.round(((i + 1) / frameCount) * 100));

      // ── Pace to real-time ────────────────────────────────────────────────
      // How much video time has elapsed since we started (ms)
      const videoElapsedMs = (videoTime - videoTimeStart) * 1000;
      // How much wall-clock time has elapsed (ms)
      const wallElapsedMs = Date.now() - wallClockStart;
      // Wait the difference so display advances at 1x speed
      const paceDelay = Math.max(0, videoElapsedMs - wallElapsedMs);
      if (paceDelay > 0) {
        await new Promise<void>(r => setTimeout(r, paceDelay));
      } else {
        // Always yield at least one tick so React can update the progress bar
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }

    if (snapshots.length === 0) {
      setErrorMsg(detectedCount === 0
        ? 'No person detected. Tips: ensure the worker fills at least 30% of the frame, use good lighting, and avoid extreme side angles.'
        : 'Person detected but pose could not be computed. Try a video with a clearer view of the full body.');
      setAnalysisState('error');
      return;
    }

    const record = summarizeSession(
      snapshots, taskProfileRef.current, Math.round(duration),
      'video-upload' as SessionSource,
      {
        assessor: assessor || undefined,
        department: department || undefined,
        location: workLocation || undefined,
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
  }, [videoFile, videoUrl, loadModel, assessor, department, workLocation, notes, baselineId, addSession, navigate]);

  const isAnalyzing = analysisState === 'analyzing' || analysisState === 'loading-model';

  const updateProfile = (patch: Partial<TaskProfile>) => {
    const p = { ...taskProfile, ...patch };
    setTaskProfile(p);
    taskProfileRef.current = p;
  };

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
                  onClick={() => { setVideoFile(null); setVideoUrl(null); setAnalysisState('idle'); setLiveScores(null); }}
                  disabled={isAnalyzing}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/*
                VIDEO + CANVAS CONTAINER
                ─────────────────────────
                - bg-black, aspect-video, overflow-hidden
                - <video> absolute inset-0, object-contain — shown when NOT analyzing
                - <canvas> absolute inset-0 — ALWAYS in DOM (never display:none)
                  opacity:0 when not analyzing, opacity:1 when analyzing
                  canvas.width = offsetWidth (CSS px, no DPR)
              */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ zIndex: 1, opacity: isAnalyzing ? 0 : 1, pointerEvents: isAnalyzing ? 'none' : 'auto', transition: 'opacity 0.2s' }}
                  controls={!isAnalyzing}
                  preload="auto"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{ zIndex: 2, pointerEvents: 'none', opacity: isAnalyzing ? 1 : 0, transition: 'opacity 0.2s' }}
                />

                {/* Progress HUD */}
                {isAnalyzing && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2.5 flex items-center gap-4" style={{ zIndex: 3 }}>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-white/80 mb-1">
                        <span>
                          {analysisState === 'loading-model' ? 'Loading AI model…' : `Frame ${framesProcessed} / ${totalFrames}`}
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1" />
                    </div>
                    {liveScores && (
                      <div className="flex gap-3 text-xs font-mono shrink-0">
                        <span className="text-white/60">RULA <span className={`font-bold ${liveScores.rula >= 5 ? 'text-red-400' : liveScores.rula >= 3 ? 'text-amber-400' : 'text-green-400'}`}>{liveScores.rula.toFixed(0)}</span></span>
                        <span className="text-white/60">REBA <span className={`font-bold ${liveScores.reba >= 8 ? 'text-red-400' : liveScores.reba >= 4 ? 'text-amber-400' : 'text-green-400'}`}>{liveScores.reba.toFixed(0)}</span></span>
                      </div>
                    )}
                  </div>
                )}

                {/* Segment color legend — shown during analysis */}
                {isAnalyzing && liveScores && (
                  <div className="absolute top-2 right-2 flex flex-col gap-1 text-[10px] font-mono" style={{ zIndex: 3 }}>
                    {[
                      { label: 'Safe', color: '#22c55e' },
                      { label: 'Caution', color: '#eab308' },
                      { label: 'Warning', color: '#f97316' },
                      { label: 'Danger', color: '#ef4444' },
                    ].map(({ label, color }) => (
                      <div key={label} className="flex items-center gap-1 bg-black/60 rounded px-1.5 py-0.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-white/80">{label}</span>
                      </div>
                    ))}
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

          {/* Assessment Details */}
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

          {/* Tips */}
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
