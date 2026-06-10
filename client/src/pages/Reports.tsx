/**
 * Reports.tsx — ErgoKit Professional Reporting Module
 * =====================================================
 * 7 report types, all rendered in-app with the brand system:
 *   Barlow Condensed | navy #1B3A6B | coral #ED6B4D | teal #03555B | gray #D0D2D3
 *
 * 1. Individual Assessment Report
 * 2. Before & After (Intervention) Report
 * 3. Job / Workstation Risk Profile
 * 4. Prioritization / Rollup Report
 * 5. Longitudinal / Trend Report
 * 6. Compliance / Documentation Record
 * 7. Executive Summary
 */

import { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
} from 'recharts';
import { useSession } from '@/contexts/SessionContext';
import {
  BRAND, RISK_COLORS, RISK_LABELS, METHODOLOGY_TEXT,
  MOCK_SESSION_BASELINE, MOCK_SESSION_FOLLOWUP, MOCK_SESSIONS_MULTI,
  buildTrendData, buildRollupData, formatDate, formatDateTime,
  formatDuration, rulaActionLevel, rebaActionLevel,
} from '@/lib/report-data';
import type { SessionRecord, RiskLevel, CorrectiveAction } from '@/lib/ergo-engine';
import {
  FileText, TrendingUp, BarChart2, List, Clock, Shield, Briefcase,
  Printer, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Circle,
  Download, GitCompare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── BRAND HEADER ─────────────────────────────────────────────────────────────
function ReportHeader({
  title, subtitle, date, assessor, docId,
}: { title: string; subtitle?: string; date: string; assessor?: string; docId?: string }) {
  return (
    <div className="mb-8 pb-6 border-b-2" style={{ borderColor: BRAND.navy }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: BRAND.navy }}>
              <span className="text-white text-xs font-bold" style={{ fontFamily: BRAND.font }}>EK</span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>ErgoKit — Industrial Ergonomics Assessment</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight mt-2" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{title}</h1>
          {subtitle && <p className="text-base mt-1 text-gray-500" style={{ fontFamily: BRAND.fontBody }}>{subtitle}</p>}
        </div>
        <div className="text-right text-xs shrink-0 text-gray-500" style={{ fontFamily: BRAND.fontBody }}>
          {docId && <p className="font-mono font-semibold mb-0.5">{docId}</p>}
          <p>Generated: {formatDateTime(date)}</p>
          {assessor && <p>Assessor: {assessor}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── RISK BADGE ───────────────────────────────────────────────────────────────
function RiskBadge({ level, size = 'sm' }: { level: RiskLevel; size?: 'sm' | 'md' | 'lg' }) {
  const color = RISK_COLORS[level];
  const label = RISK_LABELS[level];
  const sz = size === 'lg' ? 'px-4 py-1.5 text-base' : size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={cn('inline-flex items-center rounded font-bold uppercase tracking-wide', sz)}
      style={{ background: color + '20', color, border: `1px solid ${color}40`, fontFamily: BRAND.font }}
    >
      {label}
    </span>
  );
}

// ─── SCORE CARD ───────────────────────────────────────────────────────────────
function ScoreCard({ label, score, max, unit, riskLevel, actionLabel, actionColor }:
  { label: string; score: number; max: number; unit?: string; riskLevel: RiskLevel; actionLabel: string; actionColor: string }) {
  const pct = Math.min(100, (score / max) * 100);
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: BRAND.gray }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>{label}</span>
        <RiskBadge level={riskLevel} />
      </div>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-black leading-none" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{score.toFixed(1)}</span>
        <span className="text-sm text-gray-500 mb-1">/ {max}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: actionColor }} />
      </div>
      <p className="text-xs font-semibold" style={{ color: actionColor, fontFamily: BRAND.font }}>{actionLabel}</p>
    </div>
  );
}

// ─── SECTION HEADING ─────────────────────────────────────────────────────────
function SectionHeading({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <h2 className="text-xl font-bold uppercase tracking-wide mb-4 pb-2 border-b"
      style={{ color: BRAND.navy, fontFamily: BRAND.font, borderColor: accent ?? BRAND.coral }}>
      {children}
    </h2>
  );
}

// ─── METHODOLOGY FOOTER ──────────────────────────────────────────────────────
function MethodologyFooter() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-10 pt-6 border-t" style={{ borderColor: BRAND.gray }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2"
        style={{ color: BRAND.teal, fontFamily: BRAND.font }}
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Methodology &amp; Citations
      </button>
      {open && (
        <pre className="text-xs whitespace-pre-wrap leading-relaxed p-4 rounded bg-gray-50 border"
          style={{ color: '#374151', fontFamily: BRAND.fontBody, borderColor: BRAND.gray }}>
          {METHODOLOGY_TEXT}
        </pre>
      )}
    </div>
  );
}

// ─── ANGLE TABLE ─────────────────────────────────────────────────────────────
function AngleTable({ angles }: { angles: Record<string, number> }) {
  const SAFE_RANGES: Record<string, [number, number]> = {
    neckFlexion: [0, 20], trunkFlexion: [0, 10], leftUpperArm: [0, 20], rightUpperArm: [0, 20],
    leftLowerArm: [60, 100], rightLowerArm: [60, 100], leftWrist: [0, 15], rightWrist: [0, 15],
    leftKnee: [160, 180], rightKnee: [160, 180], hipFlexion: [0, 20],
  };
  const LABELS: Record<string, string> = {
    neckFlexion: 'Neck Flexion', trunkFlexion: 'Trunk Flexion',
    leftUpperArm: 'L. Upper Arm Elevation', rightUpperArm: 'R. Upper Arm Elevation',
    leftLowerArm: 'L. Elbow Angle', rightLowerArm: 'R. Elbow Angle',
    leftWrist: 'L. Wrist Deviation', rightWrist: 'R. Wrist Deviation',
    leftKnee: 'L. Knee Angle', rightKnee: 'R. Knee Angle', hipFlexion: 'Hip Flexion',
  };
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr style={{ background: BRAND.navy }}>
          {['Joint / Region', 'Measured (°)', 'Safe Range (°)', 'Status'].map(h => (
            <th key={h} className={cn('px-3 py-2 text-white font-semibold', h === 'Joint / Region' ? 'text-left' : h === 'Status' ? 'text-center' : 'text-right')}
              style={{ fontFamily: BRAND.font }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.entries(angles).map(([key, val], i) => {
          const range = SAFE_RANGES[key];
          const label = LABELS[key] ?? key;
          const inRange = range ? val >= range[0] && val <= range[1] : true;
          return (
            <tr key={key} style={{ background: i % 2 === 0 ? '#F9FAFB' : '#FFFFFF' }}>
              <td className="px-3 py-2 font-medium" style={{ fontFamily: BRAND.fontBody }}>{label}</td>
              <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: inRange ? '#16A34A' : '#DC2626' }}>{val.toFixed(1)}°</td>
              <td className="px-3 py-2 text-right text-gray-500" style={{ fontFamily: BRAND.fontBody }}>{range ? `${range[0]}–${range[1]}°` : '—'}</td>
              <td className="px-3 py-2 text-center">
                {inRange
                  ? <CheckCircle2 className="w-4 h-4 inline" style={{ color: '#16A34A' }} />
                  : <AlertTriangle className="w-4 h-4 inline" style={{ color: '#DC2626' }} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── BODY REGION CHART ────────────────────────────────────────────────────────
function BodyRegionChart({ regions }: { regions: { region: string; score: number; riskLevel: RiskLevel }[] }) {
  const sorted = [...regions].sort((a, b) => b.score - a.score);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 80, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11, fontFamily: BRAND.fontBody }} />
        <YAxis type="category" dataKey="region" tick={{ fontSize: 11, fontFamily: BRAND.fontBody }} width={80} />
        <Tooltip formatter={(v: number) => [`${v.toFixed(1)} / 10`, 'Risk Score']} />
        <ReferenceLine x={6} stroke={BRAND.coral} strokeDasharray="4 2"
          label={{ value: 'High', position: 'top', fontSize: 10, fill: BRAND.coral }} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={RISK_COLORS[entry.riskLevel]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── ACTIONS TABLE ────────────────────────────────────────────────────────────
function ActionsTable({ actions }: { actions: CorrectiveAction[] }) {
  const priorityColor: Record<string, string> = { critical: '#991B1B', high: '#DC2626', medium: '#D97706', low: '#22C55E' };
  const statusIcon = (s: string) => {
    if (s === 'completed' || s === 'verified') return <CheckCircle2 className="w-4 h-4 inline" style={{ color: '#16A34A' }} />;
    if (s === 'in-progress') return <Circle className="w-4 h-4 inline" style={{ color: '#D97706' }} />;
    return <Circle className="w-4 h-4 inline" style={{ color: '#9CA3AF' }} />;
  };
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr style={{ background: BRAND.teal }}>
          {['Action', 'Priority', 'Status', 'Owner', 'Due'].map(h => (
            <th key={h} className={cn('px-3 py-2 text-white font-semibold', h === 'Action' || h === 'Owner' || h === 'Due' ? 'text-left' : 'text-center')}
              style={{ fontFamily: BRAND.font }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {actions.map((a, i) => (
          <tr key={a.id} style={{ background: i % 2 === 0 ? '#F9FAFB' : '#FFFFFF' }}>
            <td className="px-3 py-2" style={{ fontFamily: BRAND.fontBody }}>{a.description}</td>
            <td className="px-3 py-2 text-center">
              <span className="text-xs font-bold uppercase px-2 py-0.5 rounded"
                style={{ background: (priorityColor[a.priority] ?? '#9CA3AF') + '20', color: priorityColor[a.priority] ?? '#9CA3AF', fontFamily: BRAND.font }}>
                {a.priority}
              </span>
            </td>
            <td className="px-3 py-2 text-center">{statusIcon(a.status)}</td>
            <td className="px-3 py-2 text-gray-600" style={{ fontFamily: BRAND.fontBody }}>{a.owner ?? '—'}</td>
            <td className="px-3 py-2 text-gray-600 whitespace-nowrap" style={{ fontFamily: BRAND.fontBody }}>
              {a.dueDate ? formatDate(a.dueDate) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 1 — INDIVIDUAL ASSESSMENT REPORT
// ═══════════════════════════════════════════════════════════════════════════════
function IndividualReport({ session }: { session: SessionRecord }) {
  const rula = rulaActionLevel(session.avgRula);
  const reba = rebaActionLevel(session.avgReba);
  return (
    <div className="max-w-4xl mx-auto">
      <ReportHeader title="Individual Assessment Report" subtitle={session.taskName}
        date={session.date} assessor={session.assessor} docId={session.id} />

      <div className="rounded-xl p-5 mb-8 flex flex-wrap gap-6 items-center" style={{ background: BRAND.navy }}>
        {[
          { label: 'Overall Risk', value: <RiskBadge level={session.peakRisk} size="lg" /> },
          { label: 'Department', value: <p className="text-white font-semibold" style={{ fontFamily: BRAND.font }}>{session.department ?? '—'}</p> },
          { label: 'Duration', value: <p className="text-white font-semibold" style={{ fontFamily: BRAND.font }}>{formatDuration(session.duration)}</p> },
          { label: 'Samples', value: <p className="text-white font-semibold" style={{ fontFamily: BRAND.font }}>{session.snapshots.length || '—'}</p> },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-6">
            {i > 0 && <div className="h-10 w-px bg-white/20" />}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: BRAND.gray, fontFamily: BRAND.font }}>{item.label}</p>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <SectionHeading>Assessment Scores</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <ScoreCard label="RULA" score={session.avgRula} max={7} riskLevel={session.peakRisk} actionLabel={rula.label} actionColor={rula.color} />
        <ScoreCard label="REBA" score={session.avgReba} max={15} riskLevel={session.peakRisk} actionLabel={reba.label} actionColor={reba.color} />
        <ScoreCard label="NIOSH LI" score={session.avgNiosh} max={3} unit="LI"
          riskLevel={session.avgNiosh >= 2 ? 'high' : session.avgNiosh >= 1 ? 'medium' : 'low'}
          actionLabel={session.avgNiosh >= 2 ? 'Redesign Required' : session.avgNiosh >= 1 ? 'Some Risk' : 'Acceptable'}
          actionColor={session.avgNiosh >= 2 ? '#DC2626' : session.avgNiosh >= 1 ? '#D97706' : '#22C55E'} />
        <ScoreCard label="RSI" score={session.avgRsi} max={100}
          riskLevel={session.avgRsi >= 70 ? 'very-high' : session.avgRsi >= 40 ? 'high' : session.avgRsi >= 20 ? 'medium' : 'low'}
          actionLabel={session.avgRsi >= 40 ? 'High Strain' : 'Acceptable'}
          actionColor={session.avgRsi >= 40 ? '#DC2626' : '#22C55E'} />
      </div>

      {session.avgAngles && Object.keys(session.avgAngles).length > 0 && (
        <>
          <SectionHeading>Joint Angles (Session Average)</SectionHeading>
          <div className="mb-8 rounded-lg overflow-hidden border" style={{ borderColor: BRAND.gray }}>
            <AngleTable angles={session.avgAngles} />
          </div>
        </>
      )}

      {session.bodyRegions.length > 0 && (
        <>
          <SectionHeading>Body Region Risk Map</SectionHeading>
          <div className="mb-8"><BodyRegionChart regions={session.bodyRegions} /></div>
        </>
      )}

      {session.notes && (
        <>
          <SectionHeading>Findings &amp; Observations</SectionHeading>
          <p className="mb-8 text-sm leading-relaxed p-4 rounded-lg bg-amber-50 border border-amber-200" style={{ fontFamily: BRAND.fontBody }}>{session.notes}</p>
        </>
      )}

      {session.recommendations.length > 0 && (
        <>
          <SectionHeading>Recommended Interventions</SectionHeading>
          <ol className="mb-8 space-y-2">
            {session.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 text-sm" style={{ fontFamily: BRAND.fontBody }}>
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: BRAND.coral, fontFamily: BRAND.font }}>{i + 1}</span>
                <span className="pt-0.5">{r}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {session.actions.length > 0 && (
        <>
          <SectionHeading>Corrective Action Plan</SectionHeading>
          <div className="mb-8 rounded-lg overflow-hidden border" style={{ borderColor: BRAND.gray }}>
            <ActionsTable actions={session.actions} />
          </div>
        </>
      )}

      <div className="mt-10 pt-6 border-t grid grid-cols-3 gap-8" style={{ borderColor: BRAND.gray }}>
        {['Assessor', 'Supervisor', 'Safety Manager'].map(role => (
          <div key={role}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-8" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>{role}</p>
            <div className="border-b" style={{ borderColor: BRAND.navy }} />
            <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: BRAND.fontBody }}>Signature &amp; Date</p>
          </div>
        ))}
      </div>
      <MethodologyFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 2 — BEFORE & AFTER
// ═══════════════════════════════════════════════════════════════════════════════
function BeforeAfterReport({ before, after }: { before: SessionRecord; after: SessionRecord }) {
  const metrics = [
    { label: 'RULA', before: before.avgRula, after: after.avgRula },
    { label: 'REBA', before: before.avgReba, after: after.avgReba },
    { label: 'NIOSH LI', before: before.avgNiosh, after: after.avgNiosh },
    { label: 'RSI', before: before.avgRsi, after: after.avgRsi },
  ];
  const chartData = metrics.map(m => ({ name: m.label, Before: m.before, After: m.after }));
  return (
    <div className="max-w-4xl mx-auto">
      <ReportHeader title="Before & After Intervention Report"
        subtitle={`${before.taskName} — Intervention Effectiveness`}
        date={new Date().toISOString()} assessor={after.assessor ?? before.assessor}
        docId={`COMP-${before.id}`} />

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl p-4 border-2" style={{ borderColor: BRAND.coral }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: BRAND.coral, fontFamily: BRAND.font }}>Before Intervention</p>
          <p className="font-semibold text-sm mb-1" style={{ fontFamily: BRAND.fontBody }}>{formatDate(before.date)}</p>
          <RiskBadge level={before.peakRisk} size="md" />
        </div>
        <div className="rounded-xl p-4 border-2" style={{ borderColor: BRAND.teal }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>After Intervention</p>
          <p className="font-semibold text-sm mb-1" style={{ fontFamily: BRAND.fontBody }}>{formatDate(after.date)}</p>
          <RiskBadge level={after.peakRisk} size="md" />
        </div>
      </div>

      <SectionHeading>Score Comparison</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {metrics.map(m => {
          const imp = m.after < m.before;
          const pct = Math.abs(((m.after - m.before) / Math.max(m.before, 0.01)) * 100).toFixed(0);
          return (
            <div key={m.label} className="rounded-lg border p-4 text-center" style={{ borderColor: BRAND.gray }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>{m.label}</p>
              <div className="flex items-center justify-center gap-3 mb-2">
                <span className="text-2xl font-black" style={{ color: BRAND.coral, fontFamily: BRAND.font }}>{m.before.toFixed(1)}</span>
                <span className="text-gray-400">→</span>
                <span className="text-2xl font-black" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>{m.after.toFixed(1)}</span>
              </div>
              <span className={cn('text-sm font-bold', imp ? 'text-green-600' : 'text-red-600')} style={{ fontFamily: BRAND.font }}>
                {imp ? '▼' : '▲'} {pct}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="mb-8">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontFamily: BRAND.fontBody, fontSize: 12 }} />
            <YAxis tick={{ fontFamily: BRAND.fontBody, fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Before" fill={BRAND.coral} radius={[4, 4, 0, 0]} />
            <Bar dataKey="After" fill={BRAND.teal} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {before.bodyRegions.length > 0 && after.bodyRegions.length > 0 && (
        <>
          <SectionHeading>Body Region Risk — Before vs After</SectionHeading>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND.coral, fontFamily: BRAND.font }}>Before</p>
              <BodyRegionChart regions={before.bodyRegions} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>After</p>
              <BodyRegionChart regions={after.bodyRegions} />
            </div>
          </div>
        </>
      )}

      {after.notes && (
        <>
          <SectionHeading>Intervention Description</SectionHeading>
          <p className="mb-8 text-sm leading-relaxed p-4 rounded-lg bg-teal-50 border border-teal-200" style={{ fontFamily: BRAND.fontBody }}>{after.notes}</p>
        </>
      )}
      <MethodologyFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 3 — JOB PROFILE
// ═══════════════════════════════════════════════════════════════════════════════
function JobProfileReport({ sessions }: { sessions: SessionRecord[] }) {
  const avgRula = sessions.reduce((s, x) => s + x.avgRula, 0) / Math.max(sessions.length, 1);
  const avgReba = sessions.reduce((s, x) => s + x.avgReba, 0) / Math.max(sessions.length, 1);
  const riskOrder: RiskLevel[] = ['negligible','low','medium','high','very-high'];
  const peakRisk = sessions.reduce<RiskLevel>((max, s) =>
    riskOrder.indexOf(s.peakRisk) > riskOrder.indexOf(max) ? s.peakRisk : max, 'negligible');

  const regionMap = new Map<string, { total: number; count: number; riskLevel: RiskLevel }>();
  for (const s of sessions) {
    for (const r of s.bodyRegions) {
      const e = regionMap.get(r.region);
      if (e) { e.total += r.score; e.count++; }
      else regionMap.set(r.region, { total: r.score, count: 1, riskLevel: r.riskLevel });
    }
  }
  const avgRegions = Array.from(regionMap.entries()).map(([region, v]) => ({
    region, score: v.total / v.count, riskLevel: v.riskLevel,
  }));

  return (
    <div className="max-w-4xl mx-auto">
      <ReportHeader title="Job / Workstation Risk Profile" subtitle={sessions[0]?.taskName ?? 'Unknown Task'}
        date={new Date().toISOString()} assessor={sessions[0]?.assessor} docId={`JOB-${sessions[0]?.id}`} />

      <div className="rounded-xl p-5 mb-8 flex flex-wrap gap-6 items-center" style={{ background: BRAND.navy }}>
        {[
          { label: 'Peak Risk', value: <RiskBadge level={peakRisk} size="lg" /> },
          { label: 'Captures', value: <p className="text-white font-bold text-xl" style={{ fontFamily: BRAND.font }}>{sessions.length}</p> },
          { label: 'Avg RULA', value: <p className="text-white font-bold text-xl" style={{ fontFamily: BRAND.font }}>{avgRula.toFixed(1)}</p> },
          { label: 'Avg REBA', value: <p className="text-white font-bold text-xl" style={{ fontFamily: BRAND.font }}>{avgReba.toFixed(1)}</p> },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-6">
            {i > 0 && <div className="h-10 w-px bg-white/20" />}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: BRAND.gray, fontFamily: BRAND.font }}>{item.label}</p>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <SectionHeading>Score Distribution Across Captures</SectionHeading>
      <div className="mb-8">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={sessions.map((s, i) => ({ name: `Cap. ${i + 1}`, RULA: s.avgRula, REBA: s.avgReba }))}
            margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontFamily: BRAND.fontBody, fontSize: 11 }} />
            <YAxis tick={{ fontFamily: BRAND.fontBody, fontSize: 11 }} />
            <Tooltip /><Legend />
            <Bar dataKey="RULA" fill={BRAND.coral} radius={[4, 4, 0, 0]} />
            <Bar dataKey="REBA" fill={BRAND.navy} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <SectionHeading>Body Region Risk (Aggregated)</SectionHeading>
      <div className="mb-8"><BodyRegionChart regions={avgRegions} /></div>

      <SectionHeading>Capture Log</SectionHeading>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr style={{ background: BRAND.navy }}>
            {['Date', 'Duration', 'Samples', 'RULA', 'REBA', 'Peak Risk'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-white font-semibold" style={{ fontFamily: BRAND.font }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={s.id} style={{ background: i % 2 === 0 ? '#F9FAFB' : '#FFFFFF' }}>
              <td className="px-3 py-2" style={{ fontFamily: BRAND.fontBody }}>{formatDate(s.date)}</td>
              <td className="px-3 py-2" style={{ fontFamily: BRAND.fontBody }}>{formatDuration(s.duration)}</td>
              <td className="px-3 py-2" style={{ fontFamily: BRAND.fontBody }}>{s.snapshots.length || '—'}</td>
              <td className="px-3 py-2 font-bold" style={{ color: BRAND.coral, fontFamily: BRAND.font }}>{s.avgRula.toFixed(1)}</td>
              <td className="px-3 py-2 font-bold" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{s.avgReba.toFixed(1)}</td>
              <td className="px-3 py-2"><RiskBadge level={s.peakRisk} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <MethodologyFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 4 — PRIORITIZATION / ROLLUP
// ═══════════════════════════════════════════════════════════════════════════════
function RollupReport({ sessions }: { sessions: SessionRecord[] }) {
  const rows = buildRollupData(sessions);
  return (
    <div className="max-w-4xl mx-auto">
      <ReportHeader title="Prioritization / Rollup Report"
        subtitle="Jobs ranked by ergonomic risk — highest priority first"
        date={new Date().toISOString()} docId="ROLLUP-ALL" />

      <SectionHeading>Risk Heatmap by Job</SectionHeading>
      <div className="mb-8 grid gap-2">
        {rows.map((row, i) => {
          const color = RISK_COLORS[row.peakRisk];
          return (
            <div key={i} className="flex items-center gap-4 rounded-lg p-3 border"
              style={{ borderColor: color + '40', background: color + '08' }}>
              <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: color, fontFamily: BRAND.font }}>{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{row.taskName}</p>
                <p className="text-xs text-gray-500" style={{ fontFamily: BRAND.fontBody }}>
                  {row.department} · {row.sessionCount} capture{row.sessionCount !== 1 ? 's' : ''} · Last: {formatDate(row.lastAssessed)}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-xs text-gray-500" style={{ fontFamily: BRAND.fontBody }}>RULA / REBA</p>
                  <p className="font-bold text-sm" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{row.avgRula.toFixed(1)} / {row.avgReba.toFixed(1)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500" style={{ fontFamily: BRAND.fontBody }}>Open Actions</p>
                  <p className="font-bold text-sm" style={{ color: row.openActions > 0 ? BRAND.coral : '#22C55E', fontFamily: BRAND.font }}>{row.openActions}</p>
                </div>
                <RiskBadge level={row.peakRisk} size="md" />
              </div>
            </div>
          );
        })}
      </div>

      <SectionHeading>Detailed Ranking Table</SectionHeading>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr style={{ background: BRAND.navy }}>
            {['#', 'Task / Job', 'Dept', 'Captures', 'Avg RULA', 'Avg REBA', 'NIOSH LI', 'Open', 'Risk'].map(h => (
              <th key={h} className="text-left px-2 py-2 text-white font-semibold text-xs" style={{ fontFamily: BRAND.font }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#F9FAFB' : '#FFFFFF' }}>
              <td className="px-2 py-2 font-bold text-center" style={{ color: BRAND.coral, fontFamily: BRAND.font }}>{i + 1}</td>
              <td className="px-2 py-2 font-medium text-xs" style={{ fontFamily: BRAND.fontBody }}>{row.taskName}</td>
              <td className="px-2 py-2 text-xs text-gray-600" style={{ fontFamily: BRAND.fontBody }}>{row.department}</td>
              <td className="px-2 py-2 text-center text-xs">{row.sessionCount}</td>
              <td className="px-2 py-2 font-bold text-center" style={{ color: BRAND.coral, fontFamily: BRAND.font }}>{row.avgRula.toFixed(1)}</td>
              <td className="px-2 py-2 font-bold text-center" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{row.avgReba.toFixed(1)}</td>
              <td className="px-2 py-2 text-center text-xs">{row.avgNiosh.toFixed(2)}</td>
              <td className="px-2 py-2 text-center font-bold text-xs" style={{ color: row.openActions > 0 ? BRAND.coral : '#22C55E' }}>{row.openActions}</td>
              <td className="px-2 py-2"><RiskBadge level={row.peakRisk} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <MethodologyFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 5 — LONGITUDINAL / TREND
// ═══════════════════════════════════════════════════════════════════════════════
function TrendReport({ sessions }: { sessions: SessionRecord[] }) {
  const chartData = buildTrendData(sessions).map(t => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    RULA: t.avgRula, REBA: t.avgReba,
  }));
  return (
    <div className="max-w-4xl mx-auto">
      <ReportHeader title="Longitudinal / Trend Report"
        subtitle="Ergonomic risk over time — all sessions"
        date={new Date().toISOString()} docId="TREND-ALL" />

      <SectionHeading>RULA &amp; REBA Trend Over Time</SectionHeading>
      <div className="mb-8">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontFamily: BRAND.fontBody, fontSize: 11 }} />
            <YAxis tick={{ fontFamily: BRAND.fontBody, fontSize: 11 }} />
            <Tooltip /><Legend />
            <ReferenceLine y={5} stroke={BRAND.coral} strokeDasharray="4 2"
              label={{ value: 'RULA Action 3', position: 'right', fontSize: 10, fill: BRAND.coral }} />
            <ReferenceLine y={8} stroke={BRAND.navy} strokeDasharray="4 2"
              label={{ value: 'REBA High', position: 'right', fontSize: 10, fill: BRAND.navy }} />
            <Line type="monotone" dataKey="RULA" stroke={BRAND.coral} strokeWidth={2.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="REBA" stroke={BRAND.navy} strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <SectionHeading>Session Timeline</SectionHeading>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr style={{ background: BRAND.navy }}>
            {['Date', 'Task', 'RULA', 'REBA', 'NIOSH LI', 'RSI', 'Peak Risk', 'Assessor'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-white font-semibold text-xs" style={{ fontFamily: BRAND.font }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={s.id} style={{ background: i % 2 === 0 ? '#F9FAFB' : '#FFFFFF' }}>
              <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ fontFamily: BRAND.fontBody }}>{formatDate(s.date)}</td>
              <td className="px-3 py-2 text-xs" style={{ fontFamily: BRAND.fontBody }}>{s.taskName}</td>
              <td className="px-3 py-2 font-bold text-center" style={{ color: BRAND.coral, fontFamily: BRAND.font }}>{s.avgRula.toFixed(1)}</td>
              <td className="px-3 py-2 font-bold text-center" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{s.avgReba.toFixed(1)}</td>
              <td className="px-3 py-2 text-center text-xs">{s.avgNiosh.toFixed(2)}</td>
              <td className="px-3 py-2 text-center text-xs">{s.avgRsi.toFixed(0)}</td>
              <td className="px-3 py-2"><RiskBadge level={s.peakRisk} /></td>
              <td className="px-3 py-2 text-xs text-gray-600" style={{ fontFamily: BRAND.fontBody }}>{s.assessor ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <MethodologyFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 6 — COMPLIANCE / DOCUMENTATION RECORD
// ═══════════════════════════════════════════════════════════════════════════════
function ComplianceReport({ session }: { session: SessionRecord }) {
  return (
    <div className="max-w-4xl mx-auto">
      <ReportHeader title="Compliance / Documentation Record"
        subtitle="Ergonomic Assessment — Audit Trail"
        date={session.date} assessor={session.assessor} docId={`COMP-${session.id}`} />

      <div className="rounded-lg p-4 mb-8 border-l-4" style={{ borderColor: BRAND.teal, background: '#F0FDFA' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>Regulatory Context</p>
        <p className="text-xs leading-relaxed" style={{ fontFamily: BRAND.fontBody, color: '#374151' }}>
          This record supports compliance with OSHA General Duty Clause (29 U.S.C. § 654(a)(1)), OSHA 29 CFR 1910.900 (proposed ergonomics standard), and ANSI/HFES 100-2007. Retain for a minimum of 5 years.
        </p>
      </div>

      <SectionHeading>Assessment Identification</SectionHeading>
      <table className="w-full text-sm border-collapse mb-8">
        <tbody>
          {[
            ['Document ID', session.id],
            ['Assessment Date', formatDateTime(session.date)],
            ['Task / Job Title', session.taskName],
            ['Department', session.department ?? '—'],
            ['Location', session.location ?? '—'],
            ['Assessor', session.assessor ?? '—'],
            ['Assessment Method', 'Automated video-based pose estimation (MediaPipe BlazePose GHUM)'],
            ['Scoring Methods', 'RULA (McAtamney & Corlett, 1993), REBA (Hignett & McAtamney, 2000), NIOSH Lifting Equation (Waters et al., 1994), RSI (Moore & Garg, 1995)'],
            ['Session Duration', formatDuration(session.duration)],
            ['Samples Collected', String(session.snapshots.length || '—')],
          ].map(([label, value], i) => (
            <tr key={label} style={{ background: i % 2 === 0 ? '#F9FAFB' : '#FFFFFF' }}>
              <td className="px-3 py-2 font-semibold text-xs w-48" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{label}</td>
              <td className="px-3 py-2 text-xs" style={{ fontFamily: BRAND.fontBody }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionHeading>Assessment Results</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'RULA Score', value: session.avgRula.toFixed(1), sub: `Action Level ${rulaActionLevel(session.avgRula).level}` },
          { label: 'REBA Score', value: session.avgReba.toFixed(1), sub: `Action Level ${rebaActionLevel(session.avgReba).level}` },
          { label: 'NIOSH LI', value: session.avgNiosh.toFixed(2), sub: session.avgNiosh >= 1 ? 'Exceeds RWL' : 'Within RWL' },
          { label: 'Overall Risk', value: RISK_LABELS[session.peakRisk], sub: 'Peak observed' },
        ].map(c => (
          <div key={c.label} className="rounded-lg border p-3 text-center" style={{ borderColor: BRAND.gray }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>{c.label}</p>
            <p className="text-2xl font-black" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{c.value}</p>
            <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: BRAND.fontBody }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {session.actions.length > 0 && (
        <>
          <SectionHeading>Corrective Actions Recorded</SectionHeading>
          <div className="mb-8 rounded-lg overflow-hidden border" style={{ borderColor: BRAND.gray }}>
            <ActionsTable actions={session.actions} />
          </div>
        </>
      )}

      <SectionHeading>Methodology Statement</SectionHeading>
      <pre className="text-xs whitespace-pre-wrap leading-relaxed p-4 rounded-lg bg-gray-50 border mb-8"
        style={{ color: '#374151', fontFamily: BRAND.fontBody, borderColor: BRAND.gray }}>
        {METHODOLOGY_TEXT}
      </pre>

      <SectionHeading>Certification &amp; Sign-Off</SectionHeading>
      <p className="text-xs mb-6 leading-relaxed" style={{ fontFamily: BRAND.fontBody, color: '#374151' }}>
        I certify that this ergonomic assessment was conducted in accordance with the stated methodology, that the results accurately reflect the observed task conditions, and that the corrective actions listed represent appropriate risk controls.
      </p>
      <div className="grid grid-cols-3 gap-8 mt-4">
        {['Assessor', 'Department Manager', 'Safety Director'].map(role => (
          <div key={role}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-8" style={{ color: BRAND.teal, fontFamily: BRAND.font }}>{role}</p>
            <div className="border-b" style={{ borderColor: BRAND.navy }} />
            <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: BRAND.fontBody }}>Signature &amp; Date</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 7 — EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
function ExecutiveSummary({ sessions }: { sessions: SessionRecord[] }) {
  const total = sessions.length;
  const highRisk = sessions.filter(s => s.peakRisk === 'high' || s.peakRisk === 'very-high').length;
  const avgRula = sessions.reduce((s, x) => s + x.avgRula, 0) / Math.max(total, 1);
  const avgReba = sessions.reduce((s, x) => s + x.avgReba, 0) / Math.max(total, 1);
  const openActions = sessions.reduce((s, x) => s + x.actions.filter(a => a.status === 'open').length, 0);
  const rollup = buildRollupData(sessions).slice(0, 3);
  const riskDist: Record<RiskLevel, number> = { negligible: 0, low: 0, medium: 0, high: 0, 'very-high': 0 };
  for (const s of sessions) riskDist[s.peakRisk]++;
  const distData = (Object.entries(riskDist) as [RiskLevel, number][])
    .map(([level, count]) => ({ name: RISK_LABELS[level], count, color: RISK_COLORS[level] }))
    .filter(d => d.count > 0);

  return (
    <div className="max-w-4xl mx-auto">
      <ReportHeader title="Executive Summary"
        subtitle="Ergonomic Risk Overview — All Assessments"
        date={new Date().toISOString()} docId="EXEC-SUMMARY" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Assessments', value: total, color: BRAND.navy },
          { label: 'High / Very High Risk', value: highRisk, color: BRAND.coral },
          { label: 'Avg RULA Score', value: avgRula.toFixed(1), color: BRAND.teal },
          { label: 'Open Actions', value: openActions, color: openActions > 0 ? BRAND.coral : '#22C55E' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4 border-2 text-center"
            style={{ borderColor: k.color + '40', background: k.color + '08' }}>
            <p className="text-3xl font-black mb-1" style={{ color: k.color, fontFamily: BRAND.font }}>{k.value}</p>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500" style={{ fontFamily: BRAND.font }}>{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>
          <SectionHeading>Risk Distribution</SectionHeading>
          <div className="space-y-3">
            {distData.map(d => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-24 text-xs font-semibold" style={{ color: d.color, fontFamily: BRAND.font }}>{d.name}</span>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(d.count / total) * 100}%`, background: d.color }} />
                </div>
                <span className="w-6 text-xs font-bold text-right" style={{ color: d.color, fontFamily: BRAND.font }}>{d.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHeading>Top Priority Jobs</SectionHeading>
          <div className="space-y-3">
            {rollup.map((row, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border"
                style={{ borderColor: RISK_COLORS[row.peakRisk] + '40', background: RISK_COLORS[row.peakRisk] + '08' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: RISK_COLORS[row.peakRisk], fontFamily: BRAND.font }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>{row.taskName}</p>
                  <p className="text-xs text-gray-500" style={{ fontFamily: BRAND.fontBody }}>
                    REBA {row.avgReba.toFixed(1)} · {row.openActions} open action{row.openActions !== 1 ? 's' : ''}
                  </p>
                </div>
                <RiskBadge level={row.peakRisk} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {sessions.length >= 2 && (
        <>
          <SectionHeading>Risk Trend</SectionHeading>
          <div className="mb-8">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={buildTrendData(sessions).map(t => ({
                  date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  RULA: t.avgRula, REBA: t.avgReba,
                }))}
                margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontFamily: BRAND.fontBody, fontSize: 11 }} />
                <YAxis tick={{ fontFamily: BRAND.fontBody, fontSize: 11 }} />
                <Tooltip /><Legend />
                <Line type="monotone" dataKey="RULA" stroke={BRAND.coral} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="REBA" stroke={BRAND.navy} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <SectionHeading>Key Findings</SectionHeading>
      <ul className="mb-8 space-y-2">
        {[
          `${highRisk} of ${total} assessed job${total !== 1 ? 's' : ''} (${total > 0 ? Math.round(highRisk / total * 100) : 0}%) are rated High or Very High risk — requiring immediate investigation or engineering controls.`,
          `Average RULA score of ${avgRula.toFixed(1)} indicates ${avgRula >= 5 ? 'widespread upper-limb risk requiring systematic intervention' : 'moderate upper-limb loading across the assessed population'}.`,
          `Average REBA score of ${avgReba.toFixed(1)} indicates ${avgReba >= 8 ? 'high whole-body ergonomic risk — priority engineering review recommended' : 'moderate whole-body risk — administrative controls and monitoring recommended'}.`,
          `${openActions} corrective action${openActions !== 1 ? 's' : ''} remain open. Prioritize the top-ranked jobs listed above.`,
        ].map((finding, i) => (
          <li key={i} className="flex gap-3 text-sm" style={{ fontFamily: BRAND.fontBody }}>
            <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5"
              style={{ background: BRAND.navy, fontFamily: BRAND.font }}>{i + 1}</span>
            <span>{finding}</span>
          </li>
        ))}
      </ul>
      <MethodologyFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'individual',   label: 'Individual',    icon: FileText,  desc: 'Single session — full RULA/REBA detail' },
  { id: 'before-after', label: 'Before & After', icon: TrendingUp, desc: 'Pre/post intervention comparison' },
  { id: 'job-profile',  label: 'Job Profile',   icon: Briefcase, desc: 'Aggregated job/workstation risk' },
  { id: 'rollup',       label: 'Prioritization', icon: List,      desc: 'Jobs ranked by risk level' },
  { id: 'trend',        label: 'Trend',          icon: BarChart2, desc: 'Risk over time' },
  { id: 'compliance',   label: 'Compliance',     icon: Shield,    desc: 'Audit trail & documentation' },
  { id: 'executive',    label: 'Executive',      icon: Clock,     desc: 'One-page leadership summary' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Reports() {
  const { sessions } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>('individual');
  const [useMockData, setUseMockData] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSelector, setShowSelector] = useState(false);
  const [exportingComparison, setExportingComparison] = useState(false);

  const toggleSession = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleComparisonExport = useCallback(async () => {
    const src = useMockData ? MOCK_SESSIONS_MULTI : sessions;
    const toExport = selectedIds.size > 0
      ? src.filter(s => selectedIds.has(s.id))
      : src.slice(0, Math.min(src.length, 6));
    if (toExport.length === 0) return;
    setExportingComparison(true);
    try {
      const { exportComparisonPdf } = await import('@/lib/pdf-comparison');
      await exportComparisonPdf(toExport);
    } catch (e) {
      console.error('[ErgoKit] Comparison PDF failed:', e);
    } finally {
      setExportingComparison(false);
    }
  }, [selectedIds, sessions, useMockData]);

  const effectiveSessions = useMemo(() => {
    const src = useMockData ? MOCK_SESSIONS_MULTI : sessions;
    return src.length > 0 ? src : MOCK_SESSIONS_MULTI;
  }, [sessions, useMockData]);

  const firstSession = effectiveSessions[0] ?? MOCK_SESSION_BASELINE;

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      {/* Page header */}
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between" style={{ borderColor: BRAND.gray }}>
        <div>
          <h1 className="text-2xl font-black" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>Reports</h1>
          <p className="text-sm text-gray-500" style={{ fontFamily: BRAND.fontBody }}>
            {sessions.length > 0 ? `${sessions.length} real session${sessions.length !== 1 ? 's' : ''}` : 'No sessions yet'}
            {' · '}{useMockData || sessions.length === 0 ? 'Showing sample data' : 'Showing real data'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sessions.length > 0 && (
            <button
              onClick={() => setUseMockData(v => !v)}
              className="text-xs font-semibold px-3 py-1.5 rounded border transition-colors"
              style={{ borderColor: BRAND.teal, color: useMockData ? BRAND.teal : BRAND.navy, fontFamily: BRAND.font }}
            >
              {useMockData ? '← Real Data' : 'Sample Data →'}
            </button>
          )}
          <button
            onClick={() => setShowSelector(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
            style={{ borderColor: BRAND.teal, color: showSelector ? BRAND.teal : BRAND.navy, fontFamily: BRAND.font }}
          >
            <GitCompare className="w-4 h-4" />
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Compare'}
          </button>
          <button
            onClick={handleComparisonExport}
            disabled={exportingComparison}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50"
            style={{ borderColor: BRAND.coral, color: BRAND.coral, fontFamily: BRAND.font }}
          >
            <Download className="w-4 h-4" />
            {exportingComparison ? 'Generating…' : 'Comparison PDF'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: BRAND.navy, fontFamily: BRAND.font }}
          >
            <Printer className="w-4 h-4" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Session selector panel for comparison export */}
      {showSelector && (
        <div className="border-b bg-slate-50 px-6 py-3" style={{ borderColor: BRAND.gray }}>
          <p className="text-xs font-semibold mb-2" style={{ color: BRAND.navy, fontFamily: BRAND.font }}>
            Select sessions to include in the Comparison PDF (leave all unchecked to include all):
          </p>
          <div className="flex flex-wrap gap-2">
            {effectiveSessions.map((s, idx) => {
              const checked = selectedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSession(s.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors',
                    checked ? 'text-white' : 'bg-white text-gray-600 hover:border-gray-400',
                  )}
                  style={{
                    borderColor: checked ? BRAND.teal : BRAND.gray,
                    background: checked ? BRAND.teal : undefined,
                    fontFamily: BRAND.font,
                  }}
                >
                  <span className={cn('w-3 h-3 rounded-sm border flex items-center justify-center shrink-0', checked ? 'border-white' : 'border-gray-400')}>
                    {checked && <span className="block w-1.5 h-1.5 bg-white rounded-sm" />}
                  </span>
                  S{idx + 1}: {s.taskName.length > 22 ? s.taskName.slice(0, 20) + '…' : s.taskName}
                  <span className="opacity-60">({s.date.slice(0, 10)})</span>
                </button>
              );
            })}
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="mt-2 text-xs underline"
              style={{ color: BRAND.coral, fontFamily: BRAND.font }}
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b bg-white px-6 overflow-x-auto" style={{ borderColor: BRAND.gray }}>
        <div className="flex gap-0 min-w-max">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                  active ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-800',
                )}
                style={{ color: active ? BRAND.coral : undefined, borderColor: active ? BRAND.coral : undefined, fontFamily: BRAND.font }}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Report content */}
      <div className="px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border p-8" style={{ borderColor: BRAND.gray }}>
          {activeTab === 'individual'   && <IndividualReport session={firstSession} />}
          {activeTab === 'before-after' && <BeforeAfterReport before={effectiveSessions[0] ?? MOCK_SESSION_BASELINE} after={effectiveSessions[1] ?? MOCK_SESSION_FOLLOWUP} />}
          {activeTab === 'job-profile'  && <JobProfileReport sessions={effectiveSessions.slice(0, 4)} />}
          {activeTab === 'rollup'       && <RollupReport sessions={effectiveSessions} />}
          {activeTab === 'trend'        && <TrendReport sessions={effectiveSessions} />}
          {activeTab === 'compliance'   && <ComplianceReport session={firstSession} />}
          {activeTab === 'executive'    && <ExecutiveSummary sessions={effectiveSessions} />}
        </div>
      </div>

      <style>{`@media print { body { background: white !important; } }`}</style>
    </div>
  );
}
