/**
 * VideoUpload — ErgoKit
 * =====================
 * Design: Clinical Dashboard — deep navy sidebar, sky-blue accents, ISO risk colors
 *
 * Workflow:
 *   1. User drags-and-drops or selects a video file (mp4, mov, webm, avi)
 *   2. Task metadata is configured (task name, load, rep rate, etc.)
 *   3. "Analyze Video" triggers frame-by-frame MediaPipe BlazePose analysis
 *   4. Progress bar shows frame count; skeleton overlay drawn on a hidden canvas
 *   5. On completion, session is saved with full snapshots, body regions, actions, recommendations
 *   6. User is navigated to the session report
 *
 * Signal processing (same as live scan):
 *   - EMA jitter filter (alpha=0.25)
 *   - 65% visibility confidence gating
 *   - Torso-normalized 3D angle math
 */
import { useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Upload, Film, Play, CheckCircle2, AlertCircle,
  Settings2, ChevronRight, X, FileVideo
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useSession } from '@/contexts/SessionContext';
import {
  EMAFilter, computeSnapshot, DEFAULT_TASK_PROFILE,
  riskBgClass, riskLabel, riskColor,
  summarizeSession, buildBodyRegions, generateRecommendations, generateActions,
} from '@/lib/ergo-engine';
import type { TaskProfile, ErgoSnapshot, SessionSource } from '@/lib/ergo-engine';

// MediaPipe CDN
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

type AnalysisState = 'idle' | 'loading-model' | 'analyzing' | 'done' | 'error';

function formatDuration(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function VideoUpload() {
  const [, navigate] = useLocation();
  const { sessions, taskProfile, setTaskProfile } = useSession();

  // File state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Analysis state
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [progress, setProgress] = useState(0);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);

  // Metadata
  const [assessor, setAssessor] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [baselineId, setBaselineId] = useState('');

  // Refs for analysis
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<any>(null);
  const emaRef = useRef(new EMAFilter(0.25));
  const taskProfileRef = useRef<TaskProfile>(taskProfile);

  // ─── FILE HANDLING ─────────────────────────────────────────────────────────
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

  // ─── MODEL LOADER ──────────────────────────────────────────────────────────
  const loadModel = useCallback(async () => {
    if (poseLandmarkerRef.current) return;
    const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
    poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }, []);

  // ─── FRAME ANALYSIS ────────────────────────────────────────────────────────
  const { addSession } = useSessionAdder();

  const analyzeVideo = useCallback(async () => {
    if (!videoFile || !videoUrl) return;
    setAnalysisState('loading-model');
    setErrorMsg(null);

    try {
      await loadModel();
    } catch (err: any) {
      setErrorMsg('Failed to load pose detection model. Check your internet connection.');
      setAnalysisState('error');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    video.src = videoUrl;
    video.muted = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video load failed'));
    });

    const duration = video.duration;
    const SAMPLE_INTERVAL = 0.5; // seconds between analyzed frames
    const frameCount = Math.floor(duration / SAMPLE_INTERVAL);
    setTotalFrames(frameCount);
    setAnalysisState('analyzing');
    emaRef.current.reset();

    const snapshots: ErgoSnapshot[] = [];
    let thumbnailDataUrl: string | undefined;

    for (let i = 0; i < frameCount; i++) {
      const t = i * SAMPLE_INTERVAL;
      video.currentTime = t;

      await new Promise<void>(resolve => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
      });

      // Draw frame to canvas for skeleton overlay
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Capture thumbnail at 25% mark
      if (i === Math.floor(frameCount * 0.25) && ctx) {
        thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      }

      // Run MediaPipe detection
      let result: any;
      try {
        result = poseLandmarkerRef.current.detectForVideo(video, t * 1000);
      } catch { continue; }

      if (result?.landmarks?.length > 0) {
        const raw = result.landmarks[0];
        const smoothed = emaRef.current.smooth(raw);
        const snap = computeSnapshot(smoothed, taskProfileRef.current);
        if (snap) snapshots.push({ ...snap, timestamp: t * 1000 });
      }

      setFramesProcessed(i + 1);
      setProgress(Math.round(((i + 1) / frameCount) * 100));
    }

    if (snapshots.length === 0) {
      setErrorMsg('No person detected in the video. Ensure the worker is clearly visible and the camera angle is adequate.');
      setAnalysisState('error');
      return;
    }

    // Build session record
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

    addSession(record);
    setResultId(record.id);
    setAnalysisState('done');
    toast.success(`Analysis complete: ${record.id}`, {
      description: `${snapshots.length} frames · Peak risk: ${riskLabel(record.peakRisk)}`,
      action: { label: 'View Report', onClick: () => navigate(`/sessions/${record.id}`) },
    });
  }, [videoFile, videoUrl, loadModel, assessor, department, location, notes, baselineId, addSession, navigate]);

  const isAnalyzing = analysisState === 'analyzing' || analysisState === 'loading-model';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Upload + Preview */}
        <div className="lg:col-span-3 space-y-4">
          {/* Drop zone */}
          {!videoFile ? (
            <div
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all
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
              <input
                id="video-input"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleInputChange}
              />
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
                  variant="ghost" size="icon"
                  className="shrink-0 h-7 w-7"
                  onClick={() => { setVideoFile(null); setVideoUrl(null); setAnalysisState('idle'); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Video preview */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  className="w-full h-full object-contain"
                  controls={!isAnalyzing}
                  preload="metadata"
                />
                {/* Skeleton canvas overlay */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ display: analysisState === 'analyzing' ? 'block' : 'none' }}
                />
                {/* Analysis overlay */}
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4">
                    <div className="text-white text-center">
                      <p className="text-sm font-medium mb-1">
                        {analysisState === 'loading-model' ? 'Loading AI model…' : 'Analyzing posture…'}
                      </p>
                      <p className="text-xs text-white/60">
                        {analysisState === 'analyzing' ? `Frame ${framesProcessed} / ${totalFrames}` : 'Please wait'}
                      </p>
                    </div>
                    <div className="w-64">
                      <Progress value={progress} className="h-2" />
                    </div>
                    <p className="text-white/60 text-xs">{progress}% complete</p>
                  </div>
                )}
              </div>

              {/* Analysis result summary */}
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

        {/* Right: Configuration */}
        <div className="lg:col-span-2 space-y-4">
          {/* Task Profile */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-sky-500" />
                Task Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Label className="text-xs">Load Weight: <span className="font-semibold text-foreground">{taskProfile.loadWeight} kg</span></Label>
                <Slider
                  value={[taskProfile.loadWeight]}
                  onValueChange={([v]) => { const p = { ...taskProfile, loadWeight: v }; setTaskProfile(p); taskProfileRef.current = p; }}
                  min={0} max={50} step={0.5}
                  className="py-1"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Repetitions/min: <span className="font-semibold text-foreground">{taskProfile.repRate}</span></Label>
                <Slider
                  value={[taskProfile.repRate]}
                  onValueChange={([v]) => { const p = { ...taskProfile, repRate: v }; setTaskProfile(p); taskProfileRef.current = p; }}
                  min={1} max={60} step={1}
                  className="py-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration</Label>
                  <Select
                    value={taskProfile.duration}
                    onValueChange={v => { const p = { ...taskProfile, duration: v as TaskProfile['duration'] }; setTaskProfile(p); taskProfileRef.current = p; }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
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
                    onValueChange={v => { const p = { ...taskProfile, coupling: v as TaskProfile['coupling'] }; setTaskProfile(p); taskProfileRef.current = p; }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Assessment Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Assessment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                <Label className="text-xs">Reassessment of (Session ID)</Label>
                <Select value={baselineId} onValueChange={setBaselineId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="None (new assessment)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (new assessment)</SelectItem>
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

          {/* Analyze Button */}
          <Button
            className="w-full gap-2 bg-sky-600 hover:bg-sky-700 text-white h-10"
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
                <Play className="w-4 h-4" />
                Analyze Video
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper hook to add session to context ────────────────────────────────────
import type { SessionRecord } from '@/lib/ergo-engine';
import { useContext } from 'react';
import { SessionContext } from '@/contexts/SessionContext';

function useSessionAdder() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSessionAdder must be used within SessionProvider');
  return {
    addSession: (record: SessionRecord) => {
      ctx.addSession(record);
    },
  };
}
