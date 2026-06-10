/**
 * SessionReport — ErgoKit
 * =======================
 * Design: Clinical Dashboard — deep navy sidebar, sky-blue accents, ISO risk colors
 *
 * Sections:
 *   1. Header — session metadata, risk badge, print button
 *   2. Plain-English Summary — "What does this mean?" for non-ergonomists
 *   3. Score Cards — RULA, REBA, NIOSH LI, RSI with full layperson explanations
 *   4. Video Replay — original video with live skeleton overlay (video-upload sessions)
 *   5. Body Region Risk Map — color-coded bar chart
 *   6. Average Joint Angles — with safe-range annotations
 *   7. Risk Score Timeline — recharts line chart
 *   8. AI-Generated Recommendations — plain-language, numbered
 *   9. Corrective Actions — owner/status tracker
 *  10. Before/After Comparison (if reassessment)
 */
import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts';
import {
  ArrowLeft, Printer, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Activity, Zap, TrendingUp, Shield, HelpCircle, Eye, Play, Pause,
  RotateCcw, GitCompare, TrendingDown, Minus, Circle, Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSession } from '@/contexts/SessionContext';
import { riskBgClass, riskLabel, riskColor, buildBodyRegions, generateRecommendations, extractAngles } from '@/lib/ergo-engine';
import { exportSessionPdf } from '@/lib/pdf-export';
import { loadVideo } from '@/lib/video-store';
import type { BodyAngles } from '@/lib/ergo-engine';
import { toast } from 'sonner';
import type {
  CorrectiveAction, ActionStatus, ActionPriority, SessionRecord, RiskLevel,
} from '@/lib/ergo-engine';

// ─── Plain-English explainer data ────────────────────────────────────────────
const SCORE_EXPLAINERS = {
  rula: {
    name: 'RULA', fullName: 'Rapid Upper Limb Assessment', icon: '💪',
    whatIsIt: "RULA measures how risky your worker's arm, wrist, neck, and shoulder positions are. Think of it as a 'posture danger score' for the upper body.",
    scale: [
      { range: '1–2', label: 'Acceptable', color: 'text-green-600', bg: 'bg-green-50 border-green-200', meaning: 'The posture is fine. No action needed.' },
      { range: '3–4', label: 'Low Risk', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', meaning: 'Minor awkward positions. Worth watching, but not urgent.' },
      { range: '5–6', label: 'Medium Risk', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', meaning: 'Positions that can cause injury over time. Changes should be made soon.' },
      { range: '7', label: 'High Risk', color: 'text-red-600', bg: 'bg-red-50 border-red-200', meaning: 'Immediate action required. This posture will cause injury if continued.' },
    ],
    actionLevel: (s: number) => s <= 2 ? { label: 'No action needed', color: 'text-green-600' }
      : s <= 4 ? { label: 'Further investigation may be needed', color: 'text-yellow-600' }
      : s <= 6 ? { label: 'Investigation and changes required soon', color: 'text-orange-600' }
      : { label: 'Implement changes immediately', color: 'text-red-600' },
    maxScore: 7,
  },
  reba: {
    name: 'REBA', fullName: 'Rapid Entire Body Assessment', icon: '🧍',
    whatIsIt: "REBA looks at the whole body — back, legs, neck, and overall posture. A high REBA score means the entire body is under stress, not just the arms.",
    scale: [
      { range: '1', label: 'Negligible', color: 'text-green-600', bg: 'bg-green-50 border-green-200', meaning: 'No risk. The posture is safe.' },
      { range: '2–3', label: 'Low Risk', color: 'text-green-600', bg: 'bg-green-50 border-green-200', meaning: 'Low risk. Changes may be needed in the future.' },
      { range: '4–7', label: 'Medium Risk', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', meaning: 'Medium risk. Further investigation and changes are needed.' },
      { range: '8–10', label: 'High Risk', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', meaning: 'High risk. Investigate and implement changes soon.' },
      { range: '11–15', label: 'Very High Risk', color: 'text-red-600', bg: 'bg-red-50 border-red-200', meaning: 'Very high risk. Implement changes immediately.' },
    ],
    actionLevel: (s: number) => s <= 1 ? { label: 'No action needed', color: 'text-green-600' }
      : s <= 3 ? { label: 'Changes may be needed', color: 'text-green-600' }
      : s <= 7 ? { label: 'Further investigation and changes needed', color: 'text-yellow-600' }
      : s <= 10 ? { label: 'Investigate and implement changes soon', color: 'text-orange-600' }
      : { label: 'Implement changes immediately', color: 'text-red-600' },
    maxScore: 15,
  },
  niosh: {
    name: 'NIOSH LI', fullName: 'NIOSH Lifting Index', icon: '📦',
    whatIsIt: "The NIOSH Lifting Index tells you whether the weight being lifted is safe for most people. It compares the actual load to the maximum recommended weight for that specific lifting situation.",
    scale: [
      { range: '< 1.0', label: 'Safe', color: 'text-green-600', bg: 'bg-green-50 border-green-200', meaning: 'The lift is safe for most workers. No changes needed.' },
      { range: '1.0–2.0', label: 'Caution', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', meaning: 'Some workers may be at risk. Consider reducing the load or improving lifting conditions.' },
      { range: '> 2.0', label: 'High Risk', color: 'text-red-600', bg: 'bg-red-50 border-red-200', meaning: 'Most workers are at significant risk of back injury. Redesign the task.' },
    ],
    actionLevel: (s: number) => s < 1 ? { label: 'Acceptable lift for most workers', color: 'text-green-600' }
      : s < 2 ? { label: 'Some workers may be at risk — review conditions', color: 'text-yellow-600' }
      : { label: 'High risk of back injury — redesign the task', color: 'text-red-600' },
    maxScore: 3,
  },
  rsi: {
    name: 'RSI', fullName: 'Repetitive Strain Index', icon: '🔄',
    whatIsIt: "RSI measures the risk of repetitive strain injuries — the kind that build up over weeks from doing the same motion repeatedly. Think carpal tunnel, tendinitis, or chronic shoulder pain.",
    scale: [
      { range: '< 20', label: 'Low Risk', color: 'text-green-600', bg: 'bg-green-50 border-green-200', meaning: 'Low repetitive strain risk. The task is manageable.' },
      { range: '20–40', label: 'Moderate Risk', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', meaning: 'Moderate risk. Consider job rotation or rest breaks.' },
      { range: '> 40', label: 'High Risk', color: 'text-red-600', bg: 'bg-red-50 border-red-200', meaning: 'High risk of repetitive strain injury. Engineering controls recommended.' },
    ],
    actionLevel: (s: number) => s < 20 ? { label: 'Low strain risk', color: 'text-green-600' }
      : s < 40 ? { label: 'Moderate risk — consider job rotation or breaks', color: 'text-yellow-600' }
      : { label: 'High strain risk — engineering controls recommended', color: 'text-red-600' },
    maxScore: 60,
  },
} as const;

const ANGLE_SAFE_RANGES: Record<string, { safe: [number, number]; label: string }> = {
  neckFlexion:   { safe: [-20, 20],  label: 'Neck Flexion' },
  trunkFlexion:  { safe: [-20, 20],  label: 'Trunk Flexion' },
  leftUpperArm:  { safe: [0, 20],    label: 'L. Shoulder Elevation' },
  rightUpperArm: { safe: [0, 20],    label: 'R. Shoulder Elevation' },
  leftWrist:     { safe: [-15, 15],  label: 'L. Wrist Deviation' },
  rightWrist:    { safe: [-15, 15],  label: 'R. Wrist Deviation' },
  hipFlexion:    { safe: [-30, 30],  label: 'Hip Flexion' },
  leftKnee:      { safe: [0, 30],    label: 'L. Knee Bend' },
  rightKnee:     { safe: [0, 30],    label: 'R. Knee Bend' },
};

function getAngleRisk(key: string, value: number): 'safe' | 'caution' | 'danger' {
  const r = ANGLE_SAFE_RANGES[key];
  if (!r) return 'safe';
  const [lo, hi] = r.safe;
  const margin = (hi - lo) * 0.5;
  if (value >= lo && value <= hi) return 'safe';
  if (value >= lo - margin && value <= hi + margin) return 'caution';
  return 'danger';
}
function angleColor(risk: 'safe' | 'caution' | 'danger') {
  return risk === 'safe' ? '#22c55e' : risk === 'caution' ? '#f59e0b' : '#ef4444';
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: RiskLevel }) {
  const cls: Record<RiskLevel, string> = {
    negligible: 'bg-green-100 text-green-800 border-green-200',
    low: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    'very-high': 'bg-red-100 text-red-800 border-red-200',
  };
  const icons: Record<RiskLevel, string> = {
    negligible: '🟢', low: '🟢', medium: '🟡', high: '🟠', 'very-high': '🔴',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${cls[level]}`}>
      {icons[level]} {riskLabel(level)}
    </span>
  );
}

// ─── Score card with expandable explainer ────────────────────────────────────
// FIX 2: When notApplicable=true, render a neutral grey "N/A" badge instead of
// a colored risk level badge. Risk-level coloring may only appear when the method
// actually produced a score. A green "Negligible" badge on an N/A method creates
// a false-safety signal (reader concludes "no risk" when the truth is "not assessed").
function ScoreCard({ type, score, riskLevel, isPeak, notApplicable }: {
  type: keyof typeof SCORE_EXPLAINERS;
  score: number;
  riskLevel: RiskLevel;
  isPeak?: boolean;
  notApplicable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const exp = SCORE_EXPLAINERS[type];
  const action = exp.actionLevel(score);
  const barColor = notApplicable ? '#94a3b8' : riskColor(riskLevel); // grey bar when N/A
  const pct = notApplicable ? 0 : Math.min(100, (score / exp.maxScore) * 100);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{exp.icon}</span>
                <span className="font-bold text-foreground">{exp.name}</span>
                {isPeak && (
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">PEAK</span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">{exp.whatIsIt}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{exp.fullName}</p>
            </div>
            {/* FIX 2: N/A methods get a neutral grey badge, never a colored risk badge */}
            {notApplicable ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border bg-slate-100 text-slate-500 border-slate-300">
                — N/A
              </span>
            ) : (
              <RiskBadge level={riskLevel} />
            )}
          </div>
          {notApplicable ? (
            <div className="flex items-center gap-2 mb-3 py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-2xl font-black text-slate-400 leading-none">N/A</span>
              <span className="text-xs text-slate-500 leading-tight">Not applicable for this task type. Configure task parameters to enable.</span>
            </div>
          ) : (
          <div className="flex items-end gap-3 mb-3">
            <span className="text-4xl font-black text-foreground leading-none">{isPeak ? score.toString() : score.toFixed(1)}</span>
            <span className={`text-sm font-semibold pb-1 ${action.color}`}>{action.label}</span>
          </div>
          )}
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: barColor }} />
          </div>
        </div>
        <button
          className="w-full px-4 py-2.5 flex items-center justify-between bg-slate-50 border-t hover:bg-slate-100 transition-colors text-xs font-medium text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            What does this score mean?
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {expanded && (
          <div className="px-4 pb-4 pt-3 bg-slate-50 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">{exp.whatIsIt}</p>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Score scale:</p>
              {exp.scale.map(s => (
                <div key={s.range} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${s.bg}`}>
                  <span className={`font-bold shrink-0 ${s.color}`}>{s.range}</span>
                  <span className={`font-semibold shrink-0 ${s.color}`}>{s.label}:</span>
                  <span className="text-foreground/80">{s.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Video replay with skeleton overlay ──────────────────────────────────────
// ─── Per-segment angle-based colors (same as VideoUpload) ────────────────────
const C_GREEN  = '#22c55e';
const C_YELLOW = '#eab308';
const C_ORANGE = '#f97316';
const C_RED    = '#ef4444';
const CYAN     = '#06b6d4';

function angleToColor(angle: number, thresholds: [number, number, number]): string {
  if (angle > thresholds[2]) return C_RED;
  if (angle > thresholds[1]) return C_ORANGE;
  if (angle > thresholds[0]) return C_YELLOW;
  return C_GREEN;
}

type SegColors = { neck: string; trunk: string; upperArm: string; lowerArm: string; wrist: string; legs: string };

function getSegmentColors(angles: BodyAngles): SegColors {
  const lowerArmWorst = (a: number) => { const d = Math.abs(a - 80); return d > 50 ? C_RED : d > 30 ? C_ORANGE : d > 15 ? C_YELLOW : C_GREEN; };
  const scores = [C_GREEN, C_YELLOW, C_ORANGE, C_RED];
  const li = scores.indexOf(lowerArmWorst(angles.leftLowerArm));
  const ri = scores.indexOf(lowerArmWorst(angles.rightLowerArm));
  const knee = Math.min(angles.leftKnee, angles.rightKnee);
  return {
    neck:     angleToColor(Math.abs(angles.neckFlexion),   [10, 20, 30]),
    trunk:    angleToColor(Math.abs(angles.trunkFlexion),  [5,  20, 60]),
    upperArm: angleToColor(Math.max(angles.leftUpperArm, angles.rightUpperArm), [20, 45, 90]),
    lowerArm: scores[Math.max(li, ri)],
    wrist:    angleToColor(Math.max(angles.leftWrist, angles.rightWrist), [8, 15, 30]),
    legs:     knee < 90 ? C_RED : knee < 120 ? C_ORANGE : knee < 150 ? C_YELLOW : C_GREEN,
  };
}

type Seg = keyof SegColors;
interface Conn { a: number; b: number; seg: Seg }
const REPLAY_CONNECTIONS: Conn[] = [
  // Head / neck
  { a:0,  b:1,  seg:'neck' }, { a:1,  b:2,  seg:'neck' }, { a:2,  b:3,  seg:'neck' }, { a:3,  b:7,  seg:'neck' },
  { a:0,  b:4,  seg:'neck' }, { a:4,  b:5,  seg:'neck' }, { a:5,  b:6,  seg:'neck' }, { a:6,  b:8,  seg:'neck' },
  { a:9,  b:10, seg:'neck' },
  // Shoulders to ears
  { a:11, b:7,  seg:'neck' }, { a:12, b:8,  seg:'neck' },
  // Torso
  { a:11, b:12, seg:'trunk' }, { a:11, b:23, seg:'trunk' },
  { a:12, b:24, seg:'trunk' }, { a:23, b:24, seg:'trunk' },
  // Upper arms
  { a:11, b:13, seg:'upperArm' }, { a:12, b:14, seg:'upperArm' },
  // Lower arms
  { a:13, b:15, seg:'lowerArm' }, { a:14, b:16, seg:'lowerArm' },
  // Wrists / hands
  { a:15, b:17, seg:'wrist' }, { a:15, b:19, seg:'wrist' }, { a:17, b:19, seg:'wrist' },
  { a:16, b:18, seg:'wrist' }, { a:16, b:20, seg:'wrist' }, { a:18, b:20, seg:'wrist' },
  // Legs
  { a:23, b:25, seg:'legs' }, { a:25, b:27, seg:'legs' },
  { a:24, b:26, seg:'legs' }, { a:26, b:28, seg:'legs' },
  // Feet
  { a:27, b:29, seg:'legs' }, { a:28, b:30, seg:'legs' },
  { a:27, b:31, seg:'legs' }, { a:28, b:32, seg:'legs' },
  { a:29, b:31, seg:'legs' }, { a:30, b:32, seg:'legs' },
];
const REPLAY_JOINT_SEG: Record<number, Seg> = {
  0:'neck',1:'neck',2:'neck',3:'neck',4:'neck',5:'neck',6:'neck',7:'neck',8:'neck',9:'neck',10:'neck',
  11:'trunk',12:'trunk',
  13:'upperArm',14:'upperArm',
  15:'lowerArm',16:'lowerArm',
  17:'wrist',18:'wrist',19:'wrist',20:'wrist',21:'wrist',22:'wrist',
  23:'trunk',24:'trunk',
  25:'legs',26:'legs',27:'legs',28:'legs',29:'legs',30:'legs',31:'legs',32:'legs',
};

function drawReplayFrame(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  video: HTMLVideoElement,
  landmarks: any[],
  riskColors: boolean,
  segColors: SegColors | null,
) {
  // Canvas is transparent — video element shows through (handles rotation correctly)
  ctx.clearRect(0, 0, W, H);

  // Letterbox: map normalized [0,1] landmark coords to the area the video
  // actually occupies inside the canvas (object-contain letterboxing).
  // We use video.videoWidth/Height (the decoded frame dimensions) directly.
  // The canvas buffer is sized to match the container's CSS pixel dimensions.
  const rawW = video.videoWidth  || W;
  const rawH = video.videoHeight || H;
  const scale = Math.min(W / rawW, H / rawH);
  const drawW = rawW * scale;
  const drawH = rawH * scale;
  const drawX = (W - drawW) / 2;
  const drawY = (H - drawH) / 2;

  const CONF = 0.25;
  const lw = Math.min(2, Math.max(1.5, drawW / 400));
  const jr = Math.min(2.5, Math.max(2, drawW / 250));

  const px = (nx: number) => drawX + nx * drawW;
  const py = (ny: number) => drawY + ny * drawH;

  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const conn of REPLAY_CONNECTIONS) {
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
    const seg = REPLAY_JOINT_SEG[i] ?? 'trunk';
    ctx.beginPath();
    ctx.arc(px(pt.x), py(pt.y), jr, 0, Math.PI * 2);
    ctx.fillStyle = (riskColors && segColors) ? segColors[seg] : CYAN;
    ctx.fill();
  }
}

function VideoReplay({ session }: { session: SessionRecord }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const rVFCRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Dynamic aspect ratio — set once video metadata loads
  const [videoAspect, setVideoAspect] = useState<string>('16 / 9');
  // Risk colors always active — no toggle needed
  const riskColorsRef = useRef(true);

  // Load video from IndexedDB (blob URLs die on navigation; IDB persists)
  const [videoUrl, setVideoUrl] = useState<string | null>(
    (session as any).videoUrl as string | null ?? null
  );
  const [videoLoading, setVideoLoading] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // If we already have a live URL (same-page session, not yet navigated away), use it
    if (videoUrl && videoUrl.startsWith('blob:')) return;
    if (session.source !== 'video-upload') return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryLoad = async (attemptsLeft: number) => {
      if (cancelled) return;
      setVideoLoading(true);
      try {
        const url = await loadVideo(session.id);
        if (cancelled) { if (url) URL.revokeObjectURL(url); return; }
        if (url) {
          objectUrlRef.current = url;
          setVideoUrl(url);
          setVideoLoading(false);
          return;
        }
        // IDB write may still be in progress — retry
        if (attemptsLeft > 0) {
          retryTimer = setTimeout(() => tryLoad(attemptsLeft - 1), 1000);
        } else {
          setVideoLoading(false); // Give up after 8 retries
        }
      } catch (err) {
        console.warn('[ErgoKit] Could not load video from IDB:', err);
        if (!cancelled) setVideoLoading(false);
      }
    };

    tryLoad(8); // up to 8 retries = ~8 seconds total

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      // Revoke the Object URL we created from IDB on unmount
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.source]);

  const snapshots = session.snapshots;

  // Sort snapshots by timestamp once
  const sortedSnaps = snapshots.slice().sort((a, b) => a.timestamp - b.timestamp);

  // Interpolate landmarks AND angles between two adjacent snapshots
  const interpolatedLandmarks = useCallback((t: number): { lm: any[]; angles: BodyAngles | null } | null => {
    if (!sortedSnaps.length) return null;
    const tMs = t * 1000;
    // Find bracketing pair
    let lo = 0;
    for (let i = 0; i < sortedSnaps.length - 1; i++) {
      if (sortedSnaps[i].timestamp <= tMs) lo = i;
      else break;
    }
    const snapA = sortedSnaps[lo];
    const snapB = sortedSnaps[Math.min(lo + 1, sortedSnaps.length - 1)];
    if (snapA === snapB || !snapA.landmarks?.length) {
      return { lm: snapA.landmarks ?? [], angles: snapA.angles ?? null };
    }
    const dt = snapB.timestamp - snapA.timestamp;
    const alpha = dt > 0 ? Math.min(1, Math.max(0, (tMs - snapA.timestamp) / dt)) : 0;
    if (alpha <= 0 || !snapB.landmarks?.length) {
      return { lm: snapA.landmarks, angles: snapA.angles ?? null };
    }
    // Lerp each landmark
    const lm = snapA.landmarks.map((a: any, i: number) => {
      const b = snapB.landmarks?.[i];
      if (!b) return a;
      return {
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
        z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * alpha,
        visibility: (a.visibility ?? 1) * (1 - alpha) + (b.visibility ?? 1) * alpha,
      };
    });
    // Lerp stored angles (bypasses gatedAngle visibility gating on interpolated landmarks)
    const aA = snapA.angles;
    const aB = snapB.angles;
    let angles: BodyAngles | null = null;
    if (aA && aB) {
      const lerp = (a: number, b: number) => a + (b - a) * alpha;
      angles = {
        neckFlexion:   lerp(aA.neckFlexion,   aB.neckFlexion),
        neckLateral:   lerp(aA.neckLateral,   aB.neckLateral),
        trunkFlexion:  lerp(aA.trunkFlexion,  aB.trunkFlexion),
        trunkLateral:  lerp(aA.trunkLateral,  aB.trunkLateral),
        trunkRotation: lerp(aA.trunkRotation, aB.trunkRotation),
        leftUpperArm:  lerp(aA.leftUpperArm,  aB.leftUpperArm),
        rightUpperArm: lerp(aA.rightUpperArm, aB.rightUpperArm),
        leftLowerArm:  lerp(aA.leftLowerArm,  aB.leftLowerArm),
        rightLowerArm: lerp(aA.rightLowerArm, aB.rightLowerArm),
        leftWrist:     lerp(aA.leftWrist,     aB.leftWrist),
        rightWrist:    lerp(aA.rightWrist,    aB.rightWrist),
        leftKnee:      lerp(aA.leftKnee,      aB.leftKnee),
        rightKnee:     lerp(aA.rightKnee,     aB.rightKnee),
        hipFlexion:    lerp(aA.hipFlexion,    aB.hipFlexion),
        leftShoulderAbduction:  lerp(aA.leftShoulderAbduction  ?? 0, aB.leftShoulderAbduction  ?? 0),
        rightShoulderAbduction: lerp(aA.rightShoulderAbduction ?? 0, aB.rightShoulderAbduction ?? 0),
        leftForearmCross:  lerp(aA.leftForearmCross  ?? 0, aB.leftForearmCross  ?? 0),
        rightForearmCross: lerp(aA.rightForearmCross ?? 0, aB.rightForearmCross ?? 0),
      };
    } else if (aA) {
      angles = aA;
    }
    return { lm, angles };
  }, [sortedSnaps]);

  // Size canvas buffer once on mount (not every frame)
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width  > 10 ? rect.width  : 640;
    const H = rect.height > 10 ? rect.height : 360;
    if (canvas.width !== Math.round(W) || canvas.height !== Math.round(H)) {
      canvas.width  = Math.round(W);
      canvas.height = Math.round(H);
    }
  }, []);

  // drawFrame uses only refs — no state deps — so the rVFC loop never dies
  const interpolatedLandmarksRef = useRef(interpolatedLandmarks);
  useEffect(() => { interpolatedLandmarksRef.current = interpolatedLandmarks; }, [interpolatedLandmarks]);

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    if (W < 4 || H < 4) return;

    const interp = interpolatedLandmarksRef.current(video.currentTime);
    const lm = interp?.lm ?? null;
    let segColors: SegColors | null = null;
    // Use pre-computed interpolated angles — NOT extractAngles on interpolated landmarks
    // (extractAngles would fail visibility gating on lerped landmarks, returning all zeros → all green)
    if (interp?.angles) {
      segColors = getSegmentColors(interp.angles);
    } else if (lm?.length) {
      // Fallback for old sessions without stored angles
      try { const { angles } = extractAngles(lm); segColors = getSegmentColors(angles); } catch { /* skip */ }
    }

    drawReplayFrame(ctx, W, H, video, lm ?? [], true, segColors);
    setCurrentTime(video.currentTime);

    if (!video.paused && !video.ended) {
      if ('requestVideoFrameCallback' in video) {
        rVFCRef.current = (video as any).requestVideoFrameCallback(() => drawFrame());
      } else {
        rafRef.current = requestAnimationFrame(drawFrame);
      }
    }
  }, []); // stable — no state deps, uses only refs

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const v = videoRef.current;
    if (v && rVFCRef.current !== null && 'cancelVideoFrameCallback' in v) {
      (v as any).cancelVideoFrameCallback(rVFCRef.current);
      rVFCRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    if ('requestVideoFrameCallback' in (videoRef.current ?? {})) {
      rVFCRef.current = (videoRef.current as any).requestVideoFrameCallback(() => drawFrame());
    } else {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [drawFrame, stopLoop]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); startLoop(); }
    else { v.pause(); setPlaying(false); stopLoop(); }
  }, [startLoop, stopLoop]);

  const restart = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    stopLoop();
    v.pause(); v.currentTime = 0; setPlaying(false);
    setTimeout(() => { sizeCanvas(); drawFrame(); }, 100);
  }, [drawFrame, stopLoop, sizeCanvas]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      setDuration(v.duration);
      if (v.videoWidth && v.videoHeight) {
        setVideoAspect(`${v.videoWidth} / ${v.videoHeight}`);
      }
      sizeCanvas();
    };
    const onCanPlay = () => {
      // Video has decoded enough to render — now draw the first frame
      sizeCanvas();
      setTimeout(() => drawFrame(), 50);
    };
    const onSeeked = () => {
      // After a seek (e.g. restart), redraw the new frame with skeleton
      sizeCanvas();
      drawFrame();
    };
    const onEnd = () => { setPlaying(false); stopLoop(); };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('ended', onEnd);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('ended', onEnd);
      stopLoop();
    };
  }, [drawFrame, stopLoop, sizeCanvas]);

  if (!videoUrl) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-sky-500" />Video Replay with Skeleton Overlay</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-slate-100 aspect-video flex flex-col items-center justify-center gap-3 text-muted-foreground">
            {videoLoading ? (
              <><div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" /><p className="text-sm">Loading video…</p></>
            ) : session.source === 'video-upload' ? (
              <><Eye className="w-10 h-10 opacity-30" /><p className="text-sm text-center px-4">Video not found. It may have been cleared from browser storage. Re-upload the video to restore replay.</p></>
            ) : (
              <><Eye className="w-10 h-10 opacity-30" /><p className="text-sm">Video replay is available for video-upload sessions only.</p></>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-sky-500" />Video Replay with Skeleton Overlay</CardTitle>
        <p className="text-xs text-muted-foreground">The colored skeleton shows the AI's joint tracking. Green = safe, amber = caution, red = high risk.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-center w-full">
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: videoAspect, maxHeight: '70vh', width: '100%', maxWidth: `calc(70vh * (${videoAspect.replace(' / ', '/')}))` }}>
          {/* Video always visible — handles rotation correctly via browser CSS */}
          <video ref={videoRef} src={videoUrl} className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: 1, pointerEvents: 'none' }} muted preload="auto" playsInline />
          {/* Canvas is transparent overlay — only draws skeleton lines */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 2, display: 'block', background: 'transparent' }} />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3" style={{ zIndex: 3 }}>
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
              </button>
              <button onClick={restart} className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                <RotateCcw className="w-3.5 h-3.5 text-white" />
              </button>
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer"
                onClick={e => { const r = e.currentTarget.getBoundingClientRect(); if (videoRef.current) videoRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration; }}>
                <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-white/80 text-xs font-mono shrink-0">{fmt(currentTime)} / {fmt(duration)}</span>
            </div>
          </div>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Safe</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-yellow-400 inline-block" /> Caution</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-orange-500 inline-block" /> Risk</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Danger</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Before/After comparison ──────────────────────────────────────────────────
function ComparisonPanel({ current, baseline }: { current: SessionRecord; baseline: SessionRecord }) {
  const rows = [
    { label: 'RULA', curr: current.avgRula, base: baseline.avgRula },
    { label: 'REBA', curr: current.avgReba, base: baseline.avgReba },
    { label: 'NIOSH LI', curr: current.avgNiosh, base: baseline.avgNiosh },
    { label: 'RSI', curr: current.avgRsi, base: baseline.avgRsi },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><GitCompare className="w-4 h-4 text-sky-500" />Before / After Comparison</CardTitle>
        <p className="text-xs text-muted-foreground">Baseline: {baseline.id} — {baseline.taskName} ({baseline.date})</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map(row => {
            const d = row.curr - row.base;
            const pct = row.base > 0 ? ((d / row.base) * 100).toFixed(0) : '0';
            const improved = d < 0;
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-xs font-medium w-16 shrink-0">{row.label}</span>
                <div className="flex-1 grid grid-cols-2 gap-2 text-center">
                  <div><p className="text-xs text-muted-foreground">Before</p><p className="text-lg font-bold">{row.base.toFixed(1)}</p></div>
                  <div><p className="text-xs text-muted-foreground">After</p><p className="text-lg font-bold">{row.curr.toFixed(1)}</p></div>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold w-20 justify-end ${improved ? 'text-green-600' : d === 0 ? 'text-slate-500' : 'text-red-600'}`}>
                  {improved ? <TrendingDown className="w-3.5 h-3.5" /> : d === 0 ? <Minus className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  {d === 0 ? 'No change' : `${improved ? '' : '+'}${pct}%`}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 p-3 rounded-lg bg-slate-50 border">
          <p className="text-xs font-medium">Overall Risk</p>
          <div className="flex items-center gap-4 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskBgClass(baseline.peakRisk)}`}>Before: {riskLabel(baseline.peakRisk)}</span>
            <span>→</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskBgClass(current.peakRisk)}`}>After: {riskLabel(current.peakRisk)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Corrective action row ────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<ActionPriority, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};
const STATUS_COLORS: Record<ActionStatus, string> = {
  open: 'bg-slate-100 text-slate-700',
  'in-progress': 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  verified: 'bg-emerald-100 text-emerald-800',
};

function ActionRow({ action, onStatusChange }: { action: CorrectiveAction; onStatusChange: (id: string, s: ActionStatus) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpanded(v => !v)}>
        <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug">{action.description}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[action.priority]}`}>{action.priority}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[action.status]}`}>{action.status.replace('-', ' ')}</span>
            <span className="text-xs text-muted-foreground capitalize">{action.category}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t bg-slate-50 space-y-3">
          <p className="text-xs text-muted-foreground pt-2">Risk driver: {action.riskDriver}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Update status:</span>
            <Select value={action.status} onValueChange={v => onStatusChange(action.id, v as ActionStatus)}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Angle row helper ────────────────────────────────────────────────────────────────────────────────
function AngleRow({ angleKey, value, lowConf }: { angleKey: string; value: number; lowConf?: boolean }) {
  const info = ANGLE_SAFE_RANGES[angleKey];
  if (!info) return null;
  const risk = lowConf ? 'safe' : getAngleRisk(angleKey, value);
  const color = lowConf ? '#94a3b8' : angleColor(risk);
  const [lo, hi] = info.safe;
  const maxRange = Math.max(Math.abs(lo), Math.abs(hi)) * 2.5;
  const pct = Math.min(100, (Math.abs(value) / maxRange) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{info.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-[10px]">Safe: {lo}° to {hi}°</span>
          <span className="font-bold" style={{ color }}>{value.toFixed(1)}°</span>
          {lowConf ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-300">
              ⚠ Low confidence
            </span>
          ) : risk !== 'safe' ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: color + '20', color }}>
              {risk === 'danger' ? '⚠ Outside safe range' : '~ Near limit'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/**
 * FIX 3: AngleSection renders two sub-sections:
 *   1. Peak-Posture Frame Angles (primary, authoritative) — from session.peakAngles
 *      These are the angles at the worst-posture frame that produced the peak score.
 *      Recommendations and corrective actions are derived from this frame.
 *   2. Clip Average Angles (secondary, non-authoritative, collapsible) — from session.avgAngles
 *      Provided for context only. Labeled explicitly as non-authoritative.
 */
function AngleSection({ session }: { session: SessionRecord }) {
  const [avgExpanded, setAvgExpanded] = useState(false);
  const hasPeak = session.peakAngles && Object.keys(session.peakAngles).length > 0;
  const hasAvg  = session.avgAngles  && Object.keys(session.avgAngles).length  > 0;
  if (!hasPeak && !hasAvg) return null;

  const frameLabel = session.peakAnglesFrame !== undefined
    ? `Frame #${session.peakAnglesFrame + 1} (peak RULA posture)`
    : 'peak RULA posture frame';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-500" />
          Peak-Posture Frame Angles
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Joint angles at the {frameLabel} — the evidence that justifies the headline score.
          Red values are outside the published safe range.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPeak && (
          <div className="space-y-3">
            {Object.entries(session.peakAngles!).map(([key, value]) => (
              <AngleRow key={key} angleKey={key} value={value} />
            ))}
          </div>
        )}

        {/* Clip-average angles — collapsible, explicitly non-authoritative */}
        {hasAvg && (
          <div className="border-t pt-3">
            <button
              className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              onClick={() => setAvgExpanded(v => !v)}
            >
              <span className="flex items-center gap-1.5">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${avgExpanded ? 'rotate-180' : ''}`} />
                Clip Average Angles
                <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200">
                  non-authoritative
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                Average across all {session.snapshots.length} frames — does not represent any single posture
              </span>
            </button>
            {avgExpanded && (
              <div className="mt-3 space-y-3 pl-1 border-l-2 border-slate-200">
                <p className="text-[11px] text-muted-foreground italic ml-2">
                  These are clip-wide averages. They do not correspond to the peak score and should not be used to justify the headline assessment.
                </p>
                {Object.entries(session.avgAngles!).map(([key, value]) => (
                  <AngleRow key={key} angleKey={key} value={value} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────────────────────
export default function SessionReport() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { sessions } = useSession();
  const session = sessions.find(s => s.id === id);
  const [actions, setActions] = useState<CorrectiveAction[]>(session?.actions ?? []);

  const handleStatusChange = useCallback((actionId: string, status: ActionStatus) => {
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, status } : a));
    toast.success('Action status updated');
  }, []);

  const [exporting, setExporting] = useState(false);
  const handleExportPdf = useCallback(async () => {
    if (!session) return;
    setExporting(true);
    try {
      await exportSessionPdf(session);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('PDF export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [session]);

  if (!session) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <h2 className="text-xl font-bold">Session not found</h2>
        <p className="text-sm text-muted-foreground max-w-sm">This session may have been deleted or the ID is incorrect.</p>
        <Button variant="outline" onClick={() => navigate('/sessions')} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Sessions
        </Button>
      </div>
    );
  }

  // Timeline data — use continuous joint angles (vary per frame) not stepped RULA/REBA integers
  const step = Math.max(1, Math.floor(session.snapshots.length / 80));
  const filteredSnaps = session.snapshots.filter((_, i) => i % step === 0);
  const tSpread = filteredSnaps.length > 1
    ? (filteredSnaps[filteredSnaps.length - 1].timestamp - filteredSnaps[0].timestamp) / 1000
    : 0;
  const useTimestamps = tSpread > 1;
  const chartData = filteredSnaps.map((s, i) => {
    const t = useTimestamps ? Math.round(s.timestamp / 1000) : i;
    // Use raw angles for continuous variation; fall back to score if angles missing
    const neck   = s.angles ? Math.round(Math.abs(s.angles.neckFlexion) * 10) / 10 : s.rula.score;
    const trunk  = s.angles ? Math.round(Math.abs(s.angles.trunkFlexion) * 10) / 10 : s.reba.score;
    const rShoulder = s.angles ? Math.round(s.angles.rightUpperArm * 10) / 10 : s.rula.score;
    const lShoulder = s.angles ? Math.round(s.angles.leftUpperArm  * 10) / 10 : s.rula.score;
    return { t, Neck: neck, Trunk: trunk, 'R.Shoulder': rShoulder, 'L.Shoulder': lShoulder };
  });

  // Body regions
  const bodyRegions = session.bodyRegions?.length ? session.bodyRegions : buildBodyRegions(session.snapshots);
  const regionData = bodyRegions.map(r => ({ name: r.region, score: r.score, fill: riskColor(r.riskLevel) }));

  // Recommendations
  const recommendations = session.recommendations?.length ? session.recommendations : generateRecommendations(session.snapshots, session.taskProfile);

  // Baseline session (for before/after)
  const baselineSession = (session as any).baselineSessionId ? sessions.find(s => s.id === (session as any).baselineSessionId) : null;

  // Summary verdict
  const isHighRisk = session.peakRisk === 'high' || session.peakRisk === 'very-high';
  const isMedRisk = session.peakRisk === 'medium';
  const summaryText = isHighRisk
    ? "This assessment found serious ergonomic risks that require immediate attention. The worker's posture during this task puts them at significant risk of a musculoskeletal injury — the kind that can cause chronic pain, lost work time, or a workers' compensation claim. The scores below are not just numbers; they represent real injury risk that can be reduced with the right changes."
    : isMedRisk
    ? "This assessment found moderate ergonomic risks. The worker's posture is not immediately dangerous, but continued exposure without changes will likely lead to discomfort or injury over time. The recommendations below outline practical steps to reduce this risk."
    : "This assessment found low ergonomic risk. The worker's posture during this task is generally acceptable. Minor improvements may still be beneficial for long-term comfort, but no urgent action is required.";

  const openActions = actions.filter(a => a.status === 'open' || a.status === 'in-progress');
  const doneActions = actions.filter(a => a.status === 'completed' || a.status === 'verified');

  // Score risk levels — use PEAK integer scores for RULA/REBA (methodologically correct for ordinal scales)
  const peakRula = session.peakRula ?? Math.round(session.avgRula);
  const peakReba = session.peakReba ?? Math.round(session.avgReba);
  const rulaRisk: RiskLevel = peakRula >= 7 ? 'very-high' : peakRula >= 5 ? 'high' : peakRula >= 3 ? 'medium' : 'low';
  const rebaRisk: RiskLevel = peakReba >= 11 ? 'very-high' : peakReba >= 8 ? 'high' : peakReba >= 4 ? 'medium' : peakReba >= 2 ? 'low' : 'negligible';
  const nioshNA = session.avgNiosh === 0 && session.taskProfile?.loadWeight === 0;
  const rsiNA = session.avgRsi === 0 && (session.taskProfile?.repRate ?? 0) < 2;
  const nioshRisk: RiskLevel = nioshNA ? 'negligible' : session.avgNiosh >= 2 ? 'high' : session.avgNiosh >= 1 ? 'medium' : 'low';
  const rsiRisk: RiskLevel = rsiNA ? 'negligible' : session.avgRsi >= 40 ? 'high' : session.avgRsi >= 20 ? 'medium' : 'low';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 print:p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sessions')} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{session.taskName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{session.id}</span>
              <span>·</span><span>{session.date}</span>
              {session.assessor && <><span>·</span><span>{session.assessor}</span></>}
              {session.department && <><span>·</span><span>{session.department}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RiskBadge level={session.peakRisk} />
          <Badge variant="outline" className="text-xs">{session.source === 'video-upload' ? '📹 Video Upload' : '📷 Live Scan'}</Badge>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting} className="gap-1.5">
            {exporting ? (
              <><div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Exporting…</>
            ) : (
              <><Download className="w-3.5 h-3.5" /> Export PDF</>
            )}
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">ErgoKit Assessment Report</h1>
        <p className="text-sm text-muted-foreground">{session.taskName} · {session.id} · {session.date}</p>
      </div>

      {/* Tracking Quality Badge */}
      {(() => {
        const total = session.snapshots.length;
        const clamped = session.clampedFrames ?? 0;
        const pct = total > 0 ? Math.round((clamped / total) * 100) : 0;
        const quality = pct === 0 ? 'excellent' : pct < 10 ? 'good' : pct < 25 ? 'fair' : 'poor';
        const qColors = {
          excellent: 'bg-green-50 border-green-200 text-green-800',
          good:      'bg-green-50 border-green-200 text-green-800',
          fair:      'bg-amber-50 border-amber-200 text-amber-800',
          poor:      'bg-red-50 border-red-200 text-red-800',
        };
        const qIcons = { excellent: '✅', good: '✅', fair: '⚠️', poor: '🔴' };
        return (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm ${qColors[quality]}`}>
            <span className="text-base">{qIcons[quality]}</span>
            <div className="flex-1">
              <span className="font-semibold">Tracking Quality: {quality.charAt(0).toUpperCase() + quality.slice(1)}</span>
              <span className="ml-2 font-normal opacity-80">
                {clamped === 0
                  ? `All ${total} frames passed the anatomical plausibility check.`
                  : `${clamped} of ${total} frames (${pct}%) had at least one joint angle clamped by the plausibility guard.`
                }
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="opacity-60 hover:opacity-100 transition-opacity">
                  <HelpCircle className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">The plausibility guard checks every joint angle against published physiological limits (Kapandji 2008). Clamped frames had at least one angle outside the anatomically possible range — typically caused by fast motion blur, partial occlusion, or landmark swaps. Scores from clamped frames are down-weighted in the outlier filter. A high clamped-frame ratio (&gt;25%) suggests the video quality or camera angle may limit assessment reliability.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })()}

      {/* Plain-English Summary */}
      <Card className={`border-l-4 ${isHighRisk ? 'border-l-red-500 bg-red-50/40' : isMedRisk ? 'border-l-amber-500 bg-amber-50/40' : 'border-l-green-500 bg-green-50/40'}`}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isHighRisk ? 'bg-red-100' : isMedRisk ? 'bg-amber-100' : 'bg-green-100'}`}>
              {isHighRisk ? <AlertTriangle className="w-5 h-5 text-red-600" /> : isMedRisk ? <Activity className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-green-600" />}
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-foreground mb-1">
                {isHighRisk ? 'Action Required — High Ergonomic Risk Detected' : isMedRisk ? 'Moderate Risk — Changes Recommended' : 'Low Risk — Acceptable Posture'}
              </h2>
              <p className="text-sm text-foreground/80 leading-relaxed">{summaryText}</p>
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                <span>⏱ Duration: <strong className="text-foreground">{session.duration}s</strong></span>
                <span>📊 Frames: <strong className="text-foreground">{session.snapshots.length}</strong></span>
                <span>⚠️ Open actions: <strong className={openActions.length > 0 ? 'text-red-600' : 'text-green-600'}>{openActions.length}</strong></span>
                {session.location && <span>📍 <strong className="text-foreground">{session.location}</strong></span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score Cards */}
      <div>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-sky-500" />
          Assessment Scores
          <span className="text-xs font-normal text-muted-foreground ml-1">Click "What does this score mean?" on any card to learn more</span>
        </h2>

        {/* Sustained Peak Summary Row */}
        {(session.sustainedPeakRula != null || session.sustainedPeakReba != null) && (
          <div className="mb-4 flex flex-wrap gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-1.5 text-sm">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-700">Sustained Peak</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">The highest score maintained for at least 3 consecutive frames. Unlike the absolute peak (which may be a single-frame tracking artifact), the sustained peak represents a genuine posture held long enough to cause injury. Use this value for intervention planning.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-4 ml-1">
              {session.sustainedPeakRula != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">RULA</span>
                  <span className="text-lg font-black leading-none" style={{ color: riskColor(session.sustainedPeakRula >= 7 ? 'very-high' : session.sustainedPeakRula >= 5 ? 'high' : session.sustainedPeakRula >= 3 ? 'medium' : 'low') }}>
                    {session.sustainedPeakRula}
                  </span>
                  <span className="text-xs text-muted-foreground">/7</span>
                  {session.sustainedPeakRula < peakRula && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                      {peakRula - session.sustainedPeakRula} below abs. peak
                    </span>
                  )}
                </div>
              )}
              {session.sustainedPeakReba != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">REBA</span>
                  <span className="text-lg font-black leading-none" style={{ color: riskColor(session.sustainedPeakReba >= 11 ? 'very-high' : session.sustainedPeakReba >= 8 ? 'high' : session.sustainedPeakReba >= 4 ? 'medium' : session.sustainedPeakReba >= 2 ? 'low' : 'negligible') }}>
                    {session.sustainedPeakReba}
                  </span>
                  <span className="text-xs text-muted-foreground">/15</span>
                  {session.sustainedPeakReba < peakReba && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                      {peakReba - session.sustainedPeakReba} below abs. peak
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ScoreCard type="rula" score={peakRula} riskLevel={rulaRisk} isPeak />
          <ScoreCard type="reba" score={peakReba} riskLevel={rebaRisk} isPeak />
          <ScoreCard type="niosh" score={session.avgNiosh} riskLevel={nioshRisk} notApplicable={nioshNA} />
          <ScoreCard type="rsi" score={session.avgRsi} riskLevel={rsiRisk} notApplicable={rsiNA} />
        </div>
      </div>

      {/* Video Replay */}
      <VideoReplay session={session} />

      {/* Body Region Risk Map */}
      {regionData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-sky-500" />Body Region Risk Map</CardTitle>
            <p className="text-xs text-muted-foreground">Which parts of the body are under the most stress? Red bars indicate areas that need attention.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, regionData.length * 32)}>
              <BarChart data={regionData} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <ReTooltip formatter={(v: number) => [v.toFixed(1), 'Risk Score']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {regionData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* FIX 3: Joint Angles — Peak-Posture Frame (primary, authoritative) + Clip Average (secondary, non-authoritative) */}
      <AngleSection session={session} />

      {/* Risk Score Timeline */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-sky-500" />Risk Score Timeline</CardTitle>
            <p className="text-xs text-muted-foreground">How risk scores changed over the task duration. Spikes indicate moments of particularly risky posture.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => useTimestamps ? `${v}s` : `#${v + 1}`} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 10 }} unit="°" />
                <ReTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, name: string) => [`${v}°`, name]} />
                {/* Safe-range reference lines */}
                <ReferenceLine y={20} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'Neck safe limit', fontSize: 9, fill: '#f59e0b', position: 'insideTopRight' }} />
                <ReferenceLine y={45} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Shoulder risk', fontSize: 9, fill: '#ef4444', position: 'insideTopRight' }} />
                <Line type="monotone" dataKey="Neck" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="Trunk" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="R.Shoulder" stroke="#f97316" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="L.Shoulder" stroke="#22c55e" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />Recommendations</CardTitle>
            <p className="text-xs text-muted-foreground">Plain-language guidance based on what the AI detected. These are practical steps to reduce the risk.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-foreground/90 leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Corrective Actions */}
      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-sky-500" />Corrective Actions</CardTitle>
              <div className="flex gap-2 text-xs">
                {openActions.length > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{openActions.length} open</span>}
                {doneActions.length > 0 && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">{doneActions.length} done</span>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Auto-generated action items based on the risk analysis. Track progress as each item is addressed.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {actions.map(action => <ActionRow key={action.id} action={action} onStatusChange={handleStatusChange} />)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Before/After */}
      {baselineSession && <ComparisonPanel current={session} baseline={baselineSession} />}

      {/* Notes */}
      {session.notes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assessor Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground leading-relaxed">{session.notes}</p></CardContent>
        </Card>
      )}

      {/* Print footer */}
      <div className="hidden print:block text-xs text-muted-foreground border-t pt-4 mt-6">
        <p>Generated by ErgoKit CV Ergonomics · {new Date().toLocaleString()} · Session {session.id}</p>
        <p className="mt-1">This report is generated automatically by computer vision analysis. Results should be reviewed by a qualified ergonomist for critical decisions.</p>
      </div>
    </div>
  );
}
