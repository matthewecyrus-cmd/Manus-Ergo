/**
 * report-data.ts — ErgoKit Reporting Module
 * ==========================================
 * Provides:
 *   1. Mock/sample data for all 7 report types (for preview without a live capture)
 *   2. Data-transformation helpers that convert SessionRecord[] → report payloads
 *   3. Brand constants (Barlow Condensed, navy/coral/teal palette)
 *
 * Report types:
 *   1. Individual Assessment Report
 *   2. Before & After (Intervention) Report
 *   3. Job / Workstation Risk Profile
 *   4. Prioritization / Rollup Report
 *   5. Longitudinal / Trend Report
 *   6. Compliance / Documentation Record
 *   7. Executive Summary
 */

import type { SessionRecord, RiskLevel, BodyRegionRisk, CorrectiveAction } from './ergo-engine';

// ─── BRAND SYSTEM ────────────────────────────────────────────────────────────
export const BRAND = {
  navy:    '#1B3A6B',
  coral:   '#ED6B4D',
  teal:    '#03555B',
  gray:    '#D0D2D3',
  white:   '#FFFFFF',
  black:   '#111827',
  font:    "'Barlow Condensed', 'DM Sans', sans-serif",
  fontBody: "'DM Sans', sans-serif",
} as const;

export const RISK_COLORS: Record<RiskLevel, string> = {
  negligible: '#16A34A',
  low:        '#22C55E',
  medium:     '#D97706',
  high:       '#DC2626',
  'very-high':'#991B1B',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  negligible: 'Negligible',
  low:        'Low',
  medium:     'Medium',
  high:       'High',
  'very-high':'Very High',
};

// ─── RULA/REBA ACTION LEVEL BANDS (published) ────────────────────────────────
export const RULA_ACTION_BANDS = [
  { min: 1, max: 2, level: 1, label: 'Acceptable',         color: '#22C55E' },
  { min: 3, max: 4, level: 2, label: 'Investigate',        color: '#D97706' },
  { min: 5, max: 6, level: 3, label: 'Investigate Soon',   color: '#DC2626' },
  { min: 7, max: 7, level: 4, label: 'Implement Now',      color: '#991B1B' },
];

export const REBA_ACTION_BANDS = [
  { min: 1,  max: 1,  level: 0, label: 'Negligible',       color: '#22C55E' },
  { min: 2,  max: 3,  level: 1, label: 'Low',              color: '#86EFAC' },
  { min: 4,  max: 7,  level: 2, label: 'Medium',           color: '#D97706' },
  { min: 8,  max: 10, level: 3, label: 'High',             color: '#DC2626' },
  { min: 11, max: 15, level: 4, label: 'Very High',        color: '#991B1B' },
];

// ─── METHODOLOGY CITATIONS ────────────────────────────────────────────────────
export const METHODOLOGY_TEXT = `
RULA (Rapid Upper Limb Assessment): McAtamney L, Corlett EN. RULA: a survey method for the investigation of work-related upper limb disorders. Applied Ergonomics. 1993;24(2):91–99.
REBA (Rapid Entire Body Assessment): Hignett S, McAtamney L. Rapid Entire Body Assessment (REBA). Applied Ergonomics. 2000;31(2):201–205.
NIOSH Lifting Equation: Waters TR, Putz-Anderson V, Garg A. Applications Manual for the Revised NIOSH Lifting Equation. DHHS (NIOSH) Publication No. 94-110. 1994.
RSI (Revised Strain Index): Moore JS, Garg A. The Strain Index: a proposed method to analyze jobs for risk of distal upper extremity disorders. American Industrial Hygiene Association Journal. 1995;56(5):443–458.
Pose Estimation: MediaPipe BlazePose GHUM (Bazarevsky et al., 2020). Landmark confidence threshold ≥ 0.65. EMA filter α = 0.45 with velocity clamp ≤ 0.18 normalized units/frame.
`.trim();

// ─── MOCK SESSION DATA ────────────────────────────────────────────────────────
function makeBodyRegions(rulaScore: number, rebaScore: number): BodyRegionRisk[] {
  const rl = (s: number): RiskLevel => s >= 8 ? 'very-high' : s >= 6 ? 'high' : s >= 4 ? 'medium' : s >= 2 ? 'low' : 'negligible';
  return [
    { region: 'Neck',        score: Math.min(10, rulaScore * 0.9),  riskLevel: rl(rulaScore * 0.9),  primaryAngles: 'Flexion: 24°' },
    { region: 'Upper Back',  score: Math.min(10, rebaScore * 0.7),  riskLevel: rl(rebaScore * 0.7),  primaryAngles: 'Flexion: 18°' },
    { region: 'Lower Back',  score: Math.min(10, rebaScore * 0.8),  riskLevel: rl(rebaScore * 0.8),  primaryAngles: 'Flexion: 32°' },
    { region: 'R. Shoulder', score: Math.min(10, rulaScore * 1.1),  riskLevel: rl(rulaScore * 1.1),  primaryAngles: 'Elevation: 52°' },
    { region: 'L. Shoulder', score: Math.min(10, rulaScore * 0.8),  riskLevel: rl(rulaScore * 0.8),  primaryAngles: 'Elevation: 38°' },
    { region: 'R. Elbow',    score: Math.min(10, rulaScore * 0.6),  riskLevel: rl(rulaScore * 0.6),  primaryAngles: 'Flexion: 95°' },
    { region: 'R. Wrist',    score: Math.min(10, rulaScore * 0.7),  riskLevel: rl(rulaScore * 0.7),  primaryAngles: 'Deviation: 18°' },
    { region: 'Hips',        score: Math.min(10, rebaScore * 0.5),  riskLevel: rl(rebaScore * 0.5),  primaryAngles: 'Flexion: 12°' },
    { region: 'Knees',       score: Math.min(10, rebaScore * 0.3),  riskLevel: rl(rebaScore * 0.3),  primaryAngles: 'Flexion: 8°' },
  ];
}

function makeActions(risk: RiskLevel): CorrectiveAction[] {
  const base: CorrectiveAction[] = [
    {
      id: 'CA-001', description: 'Adjust workstation height to maintain neutral shoulder posture (elbow at 90–100°)',
      category: 'engineering', priority: 'high', status: 'open', owner: 'Facilities',
      dueDate: '2026-07-15', riskDriver: 'R. Shoulder',
    },
    {
      id: 'CA-002', description: 'Introduce task rotation every 45 minutes to reduce cumulative upper-limb loading',
      category: 'administrative', priority: 'medium', status: 'in-progress', owner: 'Operations',
      dueDate: '2026-07-01', riskDriver: 'Neck / Upper Back',
    },
    {
      id: 'CA-003', description: 'Provide forearm support or tool balancer to reduce static shoulder loading',
      category: 'engineering', priority: 'high', status: 'open', owner: 'Engineering',
      dueDate: '2026-07-15', riskDriver: 'R. Shoulder',
    },
    {
      id: 'CA-004', description: 'Implement micro-break and stretching protocol (5 min per hour)',
      category: 'administrative', priority: 'low', status: 'open', owner: 'HR/Safety',
      dueDate: '2026-08-01', riskDriver: 'General',
    },
  ];
  if (risk === 'very-high' || risk === 'high') {
    base.unshift({
      id: 'CA-000', description: 'IMMEDIATE: Remove worker from task pending engineering review',
      category: 'administrative', priority: 'critical', status: 'open', owner: 'Safety Manager',
      dueDate: '2026-06-10', riskDriver: 'Overall Risk',
    });
  }
  return base;
}

export const MOCK_SESSION_BASELINE: SessionRecord = {
  id: 'ERG-MOCK-001',
  taskName: 'Assembly Station 3 — Overhead Component Insertion',
  date: '2026-05-15T09:30:00Z',
  duration: 312,
  snapshots: [],
  avgRula: 6.8,
  avgReba: 8.4,
  avgNiosh: 1.2,
  avgRsi: 42,
  peakRula: 7,
  peakReba: 10,
  peakRulaFrame: 0,
  peakRebaFrame: 0,
  timeInHighRiskPct: 42,
  peakRisk: 'high',
  taskProfile: {
    taskName: 'Overhead Component Insertion',
    loadWeight: 3,
    repRate: 8,
    cycleDuration: 45,
    horizontalDistance: 35,
    verticalOrigin: 140,
    verticalDestination: 180,
    asymmetryAngle: 15,
    coupling: 'fair',
    duration: 'moderate',
    dominantSide: 'right',
  },
  source: 'video-upload',
  assessor: 'Sarah Chen, CPE',
  department: 'Production Line A',
  location: 'Building 3, Station 3-A',
  notes: 'Worker reports shoulder discomfort after 2 hours. Task involves sustained overhead reach at 150° shoulder flexion. 8-hour shift, 3× per week.',
  actions: makeActions('high'),
  bodyRegions: makeBodyRegions(6.8, 8.4),
  recommendations: [
    'Relocate component bins to between shoulder and elbow height to eliminate overhead reach.',
    'Consider a powered lift assist for components >2 kg.',
    'Implement 45-minute task rotation with a lower-risk complementary task.',
    'Conduct follow-up assessment within 30 days of workstation modification.',
  ],
  avgAngles: {
    neckFlexion: 24, trunkFlexion: 18, leftUpperArm: 38, rightUpperArm: 52,
    leftLowerArm: 95, rightLowerArm: 92, leftWrist: 8, rightWrist: 18,
    leftKnee: 172, rightKnee: 175, hipFlexion: 12,
  },
  clampedFrames: 0,
  sustainedPeakRula: 7,
  sustainedPeakReba: 9,
};

export const MOCK_SESSION_FOLLOWUP: SessionRecord = {
  id: 'ERG-MOCK-002',
  taskName: 'Assembly Station 3 — Overhead Component Insertion (Post-Intervention)',
  date: '2026-06-12T10:00:00Z',
  duration: 298,
  snapshots: [],
  avgRula: 3.2,
  avgReba: 3.8,
  avgNiosh: 0.8,
  avgRsi: 18,
  peakRula: 4,
  peakReba: 5,
  peakRulaFrame: 0,
  peakRebaFrame: 0,
  timeInHighRiskPct: 8,
  peakRisk: 'medium',
  taskProfile: {
    taskName: 'Overhead Component Insertion (Post)',
    loadWeight: 3,
    repRate: 8,
    cycleDuration: 45,
    horizontalDistance: 28,
    verticalOrigin: 100,
    verticalDestination: 130,
    asymmetryAngle: 5,
    coupling: 'good',
    duration: 'moderate',
    dominantSide: 'right',
  },
  source: 'video-upload',
  assessor: 'Sarah Chen, CPE',
  department: 'Production Line A',
  location: 'Building 3, Station 3-A',
  notes: 'Post-intervention: component bins repositioned to elbow height. Powered lift assist installed for components >2 kg.',
  actions: [],
  bodyRegions: makeBodyRegions(3.2, 3.8),
  recommendations: [
    'Continue monitoring at 90-day intervals.',
    'Assess remaining wrist deviation — consider ergonomic tool handle.',
  ],
  avgAngles: {
    neckFlexion: 12, trunkFlexion: 8, leftUpperArm: 22, rightUpperArm: 28,
    leftLowerArm: 88, rightLowerArm: 85, leftWrist: 5, rightWrist: 10,
    leftKnee: 174, rightKnee: 176, hipFlexion: 8,
  },
  clampedFrames: 0,
  sustainedPeakRula: 4,
  sustainedPeakReba: 4,
};

// Multiple sessions for job profile / trend / rollup reports
export const MOCK_SESSIONS_MULTI: SessionRecord[] = [
  MOCK_SESSION_BASELINE,
  MOCK_SESSION_FOLLOWUP,
  {
    id: 'ERG-MOCK-003',
    taskName: 'Packaging Line 2 — Box Sealing',
    date: '2026-05-20T14:00:00Z',
    duration: 245,
    snapshots: [],
    avgRula: 5.1,
    avgReba: 5.8,
    avgNiosh: 0.4,
    avgRsi: 28,
    peakRula: 6,
    peakReba: 7,
    peakRulaFrame: 0,
    peakRebaFrame: 0,
    timeInHighRiskPct: 12,
    peakRisk: 'medium',
    taskProfile: { ...MOCK_SESSION_BASELINE.taskProfile, taskName: 'Box Sealing', loadWeight: 1, repRate: 15 },
    source: 'video-upload',
    assessor: 'Mike Rivera, CPE',
    department: 'Packaging',
    location: 'Building 1, Line 2',
    notes: 'Repetitive wrist motion. 12 boxes/min.',
    actions: makeActions('medium'),
    bodyRegions: makeBodyRegions(5.1, 5.8),
    recommendations: ['Reduce repetition rate to <10/min.', 'Provide wrist support.'],
    avgAngles: { neckFlexion: 18, trunkFlexion: 12, leftUpperArm: 28, rightUpperArm: 35, leftWrist: 22, rightWrist: 25, leftKnee: 170, rightKnee: 172, hipFlexion: 10, leftLowerArm: 90, rightLowerArm: 88 },
    clampedFrames: 0,
    sustainedPeakRula: 6,
    sustainedPeakReba: 7,
  },
  {
    id: 'ERG-MOCK-004',
    taskName: 'Warehouse — Manual Pallet Loading',
    date: '2026-05-22T08:30:00Z',
    duration: 420,
    snapshots: [],
    avgRula: 4.2,
    avgReba: 9.1,
    avgNiosh: 2.4,
    avgRsi: 55,
    peakRula: 6,
    peakReba: 12,
    peakRulaFrame: 0,
    peakRebaFrame: 0,
    timeInHighRiskPct: 68,
    peakRisk: 'very-high',
    taskProfile: { ...MOCK_SESSION_BASELINE.taskProfile, taskName: 'Pallet Loading', loadWeight: 18, repRate: 4 },
    source: 'video-upload',
    assessor: 'Mike Rivera, CPE',
    department: 'Warehouse',
    location: 'Building 2, Dock 4',
    notes: 'Floor-level lifts to 1.5m. 18 kg boxes.',
    actions: makeActions('very-high'),
    bodyRegions: makeBodyRegions(4.2, 9.1),
    recommendations: ['Mechanical lift assist required immediately.', 'Redesign pallet height.'],
    avgAngles: { neckFlexion: 28, trunkFlexion: 45, leftUpperArm: 42, rightUpperArm: 48, leftWrist: 12, rightWrist: 15, leftKnee: 145, rightKnee: 148, hipFlexion: 55, leftLowerArm: 102, rightLowerArm: 98 },
    clampedFrames: 0,
    sustainedPeakRula: 6,
    sustainedPeakReba: 11,
  },
  {
    id: 'ERG-MOCK-005',
    taskName: 'QC Inspection — Visual Checking Station',
    date: '2026-05-28T11:00:00Z',
    duration: 180,
    snapshots: [],
    avgRula: 2.8,
    avgReba: 2.5,
    avgNiosh: 0.1,
    avgRsi: 8,
    peakRula: 3,
    peakReba: 3,
    peakRulaFrame: 0,
    peakRebaFrame: 0,
    timeInHighRiskPct: 0,
    peakRisk: 'low',
    taskProfile: { ...MOCK_SESSION_BASELINE.taskProfile, taskName: 'Visual Inspection', loadWeight: 0, repRate: 2 },
    source: 'video-upload',
    assessor: 'Sarah Chen, CPE',
    department: 'Quality Control',
    location: 'Building 3, QC Bay',
    notes: 'Seated inspection. Slight neck flexion.',
    actions: makeActions('low'),
    bodyRegions: makeBodyRegions(2.8, 2.5),
    recommendations: ['Adjust monitor height to reduce neck flexion.'],
    avgAngles: { neckFlexion: 15, trunkFlexion: 5, leftUpperArm: 18, rightUpperArm: 20, leftWrist: 4, rightWrist: 5, leftKnee: 90, rightKnee: 92, hipFlexion: 88, leftLowerArm: 95, rightLowerArm: 92 },
    clampedFrames: 0,
    sustainedPeakRula: 3,
    sustainedPeakReba: 3,
  },
  {
    id: 'ERG-MOCK-006',
    taskName: 'Welding Bay 1 — Overhead Welding',
    date: '2026-06-02T09:00:00Z',
    duration: 380,
    snapshots: [],
    avgRula: 7.0,
    avgReba: 11.2,
    avgNiosh: 0.6,
    avgRsi: 68,
    peakRula: 7,
    peakReba: 13,
    peakRulaFrame: 0,
    peakRebaFrame: 0,
    timeInHighRiskPct: 88,
    peakRisk: 'very-high',
    taskProfile: { ...MOCK_SESSION_BASELINE.taskProfile, taskName: 'Overhead Welding', loadWeight: 2, repRate: 3, duration: 'long' },
    source: 'video-upload',
    assessor: 'Sarah Chen, CPE',
    department: 'Fabrication',
    location: 'Building 4, Welding Bay 1',
    notes: 'Sustained overhead posture. Neck hyperextension observed.',
    actions: makeActions('very-high'),
    bodyRegions: makeBodyRegions(7.0, 11.2),
    recommendations: ['Redesign fixture to allow neutral neck posture.', 'Limit overhead welding to 30 min/hr.'],
    avgAngles: { neckFlexion: 35, trunkFlexion: 22, leftUpperArm: 88, rightUpperArm: 92, leftWrist: 20, rightWrist: 22, leftKnee: 168, rightKnee: 170, hipFlexion: 18, leftLowerArm: 110, rightLowerArm: 105 },
    clampedFrames: 0,
    sustainedPeakRula: 7,
    sustainedPeakReba: 12,
  },
];

// ─── TREND DATA (for Longitudinal report) ────────────────────────────────────
export interface TrendPoint {
  date: string;
  avgRula: number;
  avgReba: number;
  peakRisk: RiskLevel;
  sessionId: string;
  taskName: string;
}

export function buildTrendData(sessions: SessionRecord[]): TrendPoint[] {
  return [...sessions]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(s => ({
      date: s.date,
      avgRula: s.avgRula,
      avgReba: s.avgReba,
      peakRisk: s.peakRisk,
      sessionId: s.id,
      taskName: s.taskName,
    }));
}

// ─── ROLLUP DATA (for Prioritization report) ─────────────────────────────────
export interface RollupRow {
  taskName: string;
  department: string;
  sessionCount: number;
  avgRula: number;
  avgReba: number;
  avgNiosh: number;
  peakRisk: RiskLevel;
  openActions: number;
  lastAssessed: string;
  sessionIds: string[];
}

export function buildRollupData(sessions: SessionRecord[]): RollupRow[] {
  const map = new Map<string, RollupRow>();
  for (const s of sessions) {
    const key = `${s.department ?? 'Unknown'}::${s.taskName}`;
    const existing = map.get(key);
    const openActions = s.actions.filter(a => a.status === 'open' || a.status === 'in-progress').length;
    if (existing) {
      const n = existing.sessionCount;
      existing.avgRula = (existing.avgRula * n + s.avgRula) / (n + 1);
      existing.avgReba = (existing.avgReba * n + s.avgReba) / (n + 1);
      existing.avgNiosh = (existing.avgNiosh * n + s.avgNiosh) / (n + 1);
      existing.sessionCount++;
      existing.openActions += openActions;
      existing.sessionIds.push(s.id);
      // Keep worst risk
      const riskOrder: RiskLevel[] = ['negligible','low','medium','high','very-high'];
      if (riskOrder.indexOf(s.peakRisk) > riskOrder.indexOf(existing.peakRisk)) {
        existing.peakRisk = s.peakRisk;
      }
      if (new Date(s.date) > new Date(existing.lastAssessed)) existing.lastAssessed = s.date;
    } else {
      map.set(key, {
        taskName: s.taskName,
        department: s.department ?? 'Unknown',
        sessionCount: 1,
        avgRula: s.avgRula,
        avgReba: s.avgReba,
        avgNiosh: s.avgNiosh,
        peakRisk: s.peakRisk,
        openActions,
        lastAssessed: s.date,
        sessionIds: [s.id],
      });
    }
  }
  // Sort by risk (worst first), then by avgReba desc
  const riskOrder: RiskLevel[] = ['negligible','low','medium','high','very-high'];
  return Array.from(map.values()).sort((a, b) => {
    const rd = riskOrder.indexOf(b.peakRisk) - riskOrder.indexOf(a.peakRisk);
    return rd !== 0 ? rd : b.avgReba - a.avgReba;
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function rulaActionLevel(score: number): { level: number; label: string; color: string } {
  if (score >= 7) return { level: 4, label: 'Implement Now',    color: '#991B1B' };
  if (score >= 5) return { level: 3, label: 'Investigate Soon', color: '#DC2626' };
  if (score >= 3) return { level: 2, label: 'Investigate',      color: '#D97706' };
  return              { level: 1, label: 'Acceptable',          color: '#22C55E' };
}

export function rebaActionLevel(score: number): { level: number; label: string; color: string } {
  if (score >= 11) return { level: 4, label: 'Very High — Act Now', color: '#991B1B' };
  if (score >= 8)  return { level: 3, label: 'High — Investigate',  color: '#DC2626' };
  if (score >= 4)  return { level: 2, label: 'Medium — Review',     color: '#D97706' };
  if (score >= 2)  return { level: 1, label: 'Low — Monitor',       color: '#22C55E' };
  return               { level: 0, label: 'Negligible',             color: '#16A34A' };
}
