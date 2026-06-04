/**
 * LiveScan — ErgoKit
 * ==================
 * Main computer vision interface:
 *   - Camera feed with MediaPipe skeleton overlay
 *   - Real-time RULA / REBA / NIOSH / RSI score panels
 *   - EMA-smoothed angle readouts
 *   - Recording controls + session timer
 *   - Confidence indicator
 */
import { useRef, useEffect, useCallback } from 'react';
import {
  Camera, CameraOff, Play, Square, AlertTriangle,
  Activity, Wifi, WifiOff, ChevronRight, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePoseDetection } from '@/hooks/usePoseDetection';
import { useSession } from '@/contexts/SessionContext';
import { riskBgClass, riskLabel, riskColor } from '@/lib/ergo-engine';
import type { ScoreResult, RiskLevel } from '@/lib/ergo-engine';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

export default function LiveScan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, navigate] = useLocation();

  const [poseState, poseControls] = usePoseDetection(videoRef, canvasRef);
  const { isRecording, sessionDuration, startRecording, stopRecording, pushSnapshot, taskProfile, setTaskProfile } = useSession();

  // Push snapshots into session
  useEffect(() => {
    if (poseState.snapshot && isRecording) {
      pushSnapshot(poseState.snapshot);
    }
  }, [poseState.snapshot, isRecording, pushSnapshot]);

  // Sync task profile to pose detection
  useEffect(() => {
    poseControls.setTaskProfile(taskProfile);
  }, [taskProfile, poseControls]);

  // Size canvas buffer to match its CSS display size (once on mount + on resize)
  // Canvas defaults to 300x150 buffer — must match offsetWidth/Height for correct overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sizeCanvas = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const handleStartCamera = useCallback(async () => {
    await poseControls.startCamera();
  }, [poseControls]);

  const handleStopCamera = useCallback(() => {
    if (isRecording) {
      const record = stopRecording();
      if (record) {
        toast.success(`Session saved: ${record.id}`, {
          description: `RULA avg: ${record.avgRula} · REBA avg: ${record.avgReba}`,
        });
      }
    }
    poseControls.stopCamera();
  }, [poseControls, isRecording, stopRecording]);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      const record = stopRecording();
      if (record) {
        toast.success(`Session saved: ${record.id}`, {
          description: `Duration: ${formatDuration(record.duration)} · Peak risk: ${riskLabel(record.peakRisk)}`,
          action: { label: 'View Report', onClick: () => navigate(`/sessions/${record.id}`) },
        });
      }
    } else {
      startRecording();
      toast.info('Recording started', { description: 'ErgoKit is now logging ergonomic data.' });
    }
  }, [isRecording, startRecording, stopRecording, navigate]);

  const snap = poseState.snapshot;
  const isActive = poseState.status === 'running' || poseState.status === 'no-person';

  return (
    <div className="flex flex-col h-full bg-[oklch(0.10_0.02_240)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[oklch(0.20_0.04_240)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              poseState.status === 'running' ? 'bg-green-400 animate-pulse' :
              poseState.status === 'loading-model' ? 'bg-amber-400 animate-pulse' :
              poseState.status === 'error' ? 'bg-red-400' : 'bg-slate-500'
            }`} />
            <span className="text-xs font-medium text-slate-300" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {poseState.status === 'running' ? 'Tracking Active' :
               poseState.status === 'loading-model' ? 'Loading Model…' :
               poseState.status === 'no-person' ? 'No Person Detected' :
               poseState.status === 'error' ? 'Error' : 'Camera Off'}
            </span>
          </div>
          {isActive && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>{poseState.fps} fps</span>
              <span>·</span>
              <span className={poseState.avgConfidence >= 0.65 ? 'text-green-400' : 'text-amber-400'}>
                {Math.round(poseState.avgConfidence * 100)}% conf
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-900/40 border border-red-700/50">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-xs font-mono text-red-300">{formatDuration(sessionDuration)}</span>
            </div>
          )}
          {isActive && (
            <Button
              size="sm"
              onClick={handleToggleRecording}
              className={`gap-1.5 text-xs ${isRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[oklch(0.62_0.18_220)] hover:bg-[oklch(0.55_0.18_220)] text-white'}`}
            >
              {isRecording ? <><Square className="w-3 h-3" /> Stop</> : <><Play className="w-3 h-3" /> Record</>}
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Camera + skeleton */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            playsInline
            muted
            style={{ transform: 'scaleX(-1)' }} // mirror for natural feel
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ transform: 'scaleX(-1)', background: 'transparent' }}
          />

          {/* Idle overlay */}
          {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[oklch(0.10_0.02_240)]">
              {poseState.status === 'loading-model' ? (
                <>
                  <div className="w-12 h-12 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                  <p className="text-slate-300 text-sm font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    Loading BlazePose model…
                  </p>
                  <p className="text-slate-500 text-xs">First load may take a few seconds</p>
                </>
              ) : poseState.status === 'error' ? (
                <>
                  <AlertTriangle className="w-10 h-10 text-red-400" />
                  <p className="text-red-300 text-sm font-medium text-center max-w-xs" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {poseState.error}
                  </p>
                  <Button onClick={handleStartCamera} size="sm" className="bg-[oklch(0.62_0.18_220)] text-white gap-2">
                    <Camera className="w-4 h-4" /> Retry
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-[oklch(0.28_0.07_240)] flex items-center justify-center">
                    <Camera className="w-8 h-8 text-cyan-400" />
                  </div>
                  <p className="text-slate-200 text-base font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    Start Camera to Begin
                  </p>
                  <p className="text-slate-400 text-xs text-center max-w-xs">
                    ErgoKit will automatically detect posture and calculate ergonomic risk scores in real time.
                  </p>
                  <Button onClick={handleStartCamera} className="bg-[oklch(0.62_0.18_220)] hover:bg-[oklch(0.55_0.18_220)] text-white gap-2">
                    <Camera className="w-4 h-4" /> Enable Camera
                  </Button>
                </>
              )}
            </div>
          )}

          {/* No person overlay */}
          {poseState.status === 'no-person' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-amber-900/60 border border-amber-700/50 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-amber-300 font-medium">No person detected — ensure full body is visible</span>
            </div>
          )}

          {/* Camera off button */}
          {isActive && (
            <button
              onClick={handleStopCamera}
              className="absolute bottom-3 right-3 p-2 rounded-full bg-[oklch(0.20_0.04_240)]/80 hover:bg-[oklch(0.28_0.07_240)] transition-colors text-slate-400 hover:text-white"
            >
              <CameraOff className="w-4 h-4" />
            </button>
          )}

          {/* Signal processing badges */}
          {isActive && (
            <div className="absolute bottom-3 left-3 flex flex-col gap-1">
              <Badge color="cyan" label="EMA Filter" active />
              <Badge color={poseState.avgConfidence >= 0.65 ? 'green' : 'amber'} label={`Conf Gate ${Math.round(poseState.avgConfidence * 100)}%`} active={poseState.avgConfidence >= 0.65} />
              <Badge color="cyan" label="Torso Norm" active />
            </div>
          )}
        </div>

        {/* Score panel */}
        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col bg-[oklch(0.14_0.03_240)] border-t lg:border-t-0 lg:border-l border-[oklch(0.20_0.04_240)] overflow-y-auto">
          {snap ? (
            <>
              {/* Overall risk */}
              <div className={`px-4 py-3 border-b border-[oklch(0.20_0.04_240)] ${
                snap.overallRisk === 'very-high' ? 'bg-red-900/30' :
                snap.overallRisk === 'high' ? 'bg-red-900/20' :
                snap.overallRisk === 'medium' ? 'bg-amber-900/20' : 'bg-green-900/20'
              }`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-widest" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    Overall Risk
                  </p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${riskBgClass(snap.overallRisk)}`}>
                    {riskLabel(snap.overallRisk)}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-white" style={{ fontFamily: "'DM Sans', sans-serif", color: riskColor(snap.overallRisk) }}>
                    {snap.overallScore.toFixed(1)}
                  </span>
                  <span className="text-slate-400 text-xs">/ 10</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[oklch(0.20_0.04_240)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${snap.overallScore * 10}%`, backgroundColor: riskColor(snap.overallRisk) }}
                  />
                </div>
              </div>

              {/* Score cards */}
              <div className="p-3 space-y-2">
                <ScoreCard label="RULA" result={snap.rula} max={7} description="Upper limb" />
                <ScoreCard label="REBA" result={snap.reba} max={15} description="Whole body" />
                <ScoreCard label="NIOSH LI" result={snap.niosh} max={3} description="Lifting index" isLI />
                <ScoreCard label="RSI" result={snap.rsi} max={100} description="Strain index" />
              </div>

              {/* Live angles */}
              <div className="px-3 pb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  Live Angles
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <AngleRow label="Neck Flex" value={snap.angles.neckFlexion} warn={20} danger={30} />
                  <AngleRow label="Trunk Flex" value={snap.angles.trunkFlexion} warn={20} danger={60} />
                  <AngleRow label="L.Upper Arm" value={snap.angles.leftUpperArm} warn={45} danger={90} />
                  <AngleRow label="R.Upper Arm" value={snap.angles.rightUpperArm} warn={45} danger={90} />
                  <AngleRow label="L.Elbow" value={snap.angles.leftLowerArm} warn={100} danger={130} />
                  <AngleRow label="R.Elbow" value={snap.angles.rightLowerArm} warn={100} danger={130} />
                  <AngleRow label="L.Wrist" value={snap.angles.leftWrist} warn={15} danger={30} />
                  <AngleRow label="R.Wrist" value={snap.angles.rightWrist} warn={15} danger={30} />
                  <AngleRow label="Hip Flex" value={snap.angles.hipFlexion} warn={45} danger={90} />
                  <AngleRow label="Trunk Rot" value={snap.angles.trunkRotation} warn={15} danger={30} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <Activity className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Scores will appear here
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Enable camera and ensure your full body is visible
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ color, label, active }: { color: string; label: string; active: boolean }) {
  const colors: Record<string, string> = {
    cyan: 'border-cyan-700/50 text-cyan-400',
    green: 'border-green-700/50 text-green-400',
    amber: 'border-amber-700/50 text-amber-400',
  };
  return (
    <div className={`px-2 py-0.5 rounded text-xs font-medium border bg-black/40 ${colors[color] ?? colors.cyan} ${!active ? 'opacity-40' : ''}`}>
      {label}
    </div>
  );
}

function ScoreCard({ label, result, max, description, isLI }: {
  label: string;
  result: ScoreResult;
  max: number;
  description: string;
  isLI?: boolean;
}) {
  const pct = isLI ? Math.min(1, result.score / max) : result.score / max;
  const displayScore = isLI ? result.score.toFixed(2) : result.score;

  return (
    <div className="p-3 rounded-lg bg-[oklch(0.18_0.04_240)] border border-[oklch(0.22_0.04_240)]">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="text-xs font-bold text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
          <span className="text-xs text-slate-400 ml-1.5">{description}</span>
        </div>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${riskBgClass(result.riskLevel)}`}>
          {riskLabel(result.riskLevel)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold" style={{ fontFamily: "'DM Sans', sans-serif", color: riskColor(result.riskLevel) }}>
          {displayScore}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.22_0.04_240)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct * 100}%`, backgroundColor: riskColor(result.riskLevel) }}
          />
        </div>
        <span className="text-xs text-slate-500">/{max}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1 leading-snug">{result.interpretation}</p>
    </div>
  );
}

function AngleRow({ label, value, warn, danger }: { label: string; value: number; warn: number; danger: number }) {
  const color = value >= danger ? 'text-red-400' : value >= warn ? 'text-amber-400' : 'text-green-400';
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded bg-[oklch(0.18_0.04_240)]">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs font-mono font-bold ${color}`}>{Math.round(value)}°</span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
