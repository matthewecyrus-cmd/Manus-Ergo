/**
 * SessionReport — ErgoKit
 * ========================
 * Design: Clinical Dashboard — deep navy sidebar, sky-blue accents, ISO risk colors
 *
 * Full assessment record view:
 *   - Score summary (RULA, REBA, NIOSH, RSI) with risk badges
 *   - Risk score timeline chart
 *   - Body-region risk heat map (sorted by severity)
 *   - AI-generated plain-language recommendations
 *   - Corrective actions tracker (owner, due date, priority, status)
 *   - Before/after comparison (if this is a reassessment)
 *   - Print / PDF export
 */
import { useState, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, BarChart, Bar, Cell,
} from 'recharts';
import {
  ArrowLeft, Printer, Clock, Calendar, User, Building2, MapPin,
  CheckCircle2, Circle, AlertTriangle, ChevronDown, ChevronUp,
  FileVideo, Camera, GitCompare, Lightbulb, Wrench, ClipboardList,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from '@/contexts/SessionContext';
import {
  riskBgClass, riskLabel, riskColor,
  buildBodyRegions, generateRecommendations,
} from '@/lib/ergo-engine';
import type { CorrectiveAction, ActionStatus, ActionPriority, SessionRecord } from '@/lib/ergo-engine';
import { toast } from 'sonner';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── Risk color helpers ───────────────────────────────────────────────────────
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

const STATUS_ICONS: Record<ActionStatus, React.ReactNode> = {
  open: <Circle className="w-3.5 h-3.5" />,
  'in-progress': <AlertTriangle className="w-3.5 h-3.5" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5" />,
  verified: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
};

// ─── Corrective Action Row ────────────────────────────────────────────────────
function ActionRow({
  action,
  onStatusChange,
}: {
  action: CorrectiveAction;
  onStatusChange: (id: string, status: ActionStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="mt-0.5 shrink-0">
          {STATUS_ICONS[action.status]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug">{action.description}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[action.priority]}`}>
              {action.priority.charAt(0).toUpperCase() + action.priority.slice(1)}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[action.status]}`}>
              {action.status.replace('-', ' ')}
            </span>
            <span className="text-xs text-muted-foreground capitalize">{action.category}</span>
            {action.owner && <span className="text-xs text-muted-foreground">· {action.owner}</span>}
            {action.dueDate && <span className="text-xs text-muted-foreground">· Due {action.dueDate}</span>}
          </div>
        </div>
        <div className="shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t bg-slate-50 space-y-3">
          <p className="text-xs text-muted-foreground pt-2">Risk driver: {action.riskDriver}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">Update status:</span>
            <Select value={action.status} onValueChange={v => onStatusChange(action.id, v as ActionStatus)}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
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

// ─── Before/After Comparison ─────────────────────────────────────────────────
function ComparisonPanel({ current, baseline }: { current: SessionRecord; baseline: SessionRecord }) {
  const delta = (curr: number, base: number) => {
    const d = curr - base;
    const pct = base > 0 ? ((d / base) * 100).toFixed(0) : '0';
    return { d, pct, improved: d < 0 };
  };

  const rows = [
    { label: 'RULA', curr: current.avgRula, base: baseline.avgRula, max: 7 },
    { label: 'REBA', curr: current.avgReba, base: baseline.avgReba, max: 15 },
    { label: 'NIOSH LI', curr: current.avgNiosh, base: baseline.avgNiosh, max: 5 },
    { label: 'RSI', curr: current.avgRsi, base: baseline.avgRsi, max: 100 },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-sky-500" />
          Before / After Comparison
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Baseline: {baseline.id} — {baseline.taskName} ({baseline.date})
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map(row => {
            const { d, pct, improved } = delta(row.curr, row.base);
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-xs font-medium w-16 shrink-0">{row.label}</span>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Before</p>
                    <p className="text-lg font-bold text-foreground">{row.base.toFixed(1)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">After</p>
                    <p className="text-lg font-bold text-foreground">{row.curr.toFixed(1)}</p>
                  </div>
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
          <p className="text-xs font-medium text-foreground">Overall Risk</p>
          <div className="flex items-center gap-4 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskBgClass(baseline.peakRisk)}`}>
              Before: {riskLabel(baseline.peakRisk)}
            </span>
            <span>→</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskBgClass(current.peakRisk)}`}>
              After: {riskLabel(current.peakRisk)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SessionReport() {
  const { id } = useParams<{ id: string }>();
  const { sessions, addSession } = useSession();
  const session = sessions.find(s => s.id === id);
  const [actions, setActions] = useState<CorrectiveAction[]>(session?.actions ?? []);

  const handleStatusChange = useCallback((actionId: string, status: ActionStatus) => {
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, status } : a));
    toast.success('Action status updated');
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!session) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <p className="text-muted-foreground text-sm">Session not found.</p>
        <Link href="/sessions">
          <Button variant="ghost" size="sm" className="mt-3 gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Sessions
          </Button>
        </Link>
      </div>
    );
  }

  // Build timeline data
  const step = Math.max(1, Math.floor(session.snapshots.length / 60));
  const timelineData = session.snapshots
    .filter((_, i) => i % step === 0)
    .map((snap, i) => ({
      t: i,
      rula: snap.rula.score,
      reba: snap.reba.score,
      overall: snap.overallScore,
    }));

  // Body regions (use stored or compute)
  const bodyRegions = session.bodyRegions?.length
    ? session.bodyRegions
    : buildBodyRegions(session.snapshots);

  // Recommendations
  const recommendations = session.recommendations?.length
    ? session.recommendations
    : generateRecommendations(session.snapshots, session.taskProfile);

  // Baseline session for before/after
  const baseline = session.baselineSessionId
    ? sessions.find(s => s.id === session.baselineSessionId)
    : null;

  // Angle averages
  const avgAngles = session.snapshots.length > 0 ? {
    neckFlexion: avg(session.snapshots.map(s => s.angles.neckFlexion)),
    trunkFlexion: avg(session.snapshots.map(s => s.angles.trunkFlexion)),
    leftUpperArm: avg(session.snapshots.map(s => s.angles.leftUpperArm)),
    rightUpperArm: avg(session.snapshots.map(s => s.angles.rightUpperArm)),
    leftWrist: avg(session.snapshots.map(s => s.angles.leftWrist)),
    rightWrist: avg(session.snapshots.map(s => s.angles.rightWrist)),
    hipFlexion: avg(session.snapshots.map(s => s.angles.hipFlexion)),
  } : null;

  const openActions = actions.filter(a => a.status === 'open' || a.status === 'in-progress').length;
  const completedActions = actions.filter(a => a.status === 'completed' || a.status === 'verified').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 print:p-4 print:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/sessions">
            <Button variant="ghost" size="sm" className="gap-2 -ml-2">
              <ArrowLeft className="w-4 h-4" /> Sessions
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Print / Export PDF
          </Button>
        </div>
      </div>

      {/* Title block */}
      <div className="flex items-start gap-4">
        {session.thumbnailDataUrl ? (
          <img
            src={session.thumbnailDataUrl}
            alt="Assessment frame"
            className="w-20 h-14 object-cover rounded-lg border shrink-0"
          />
        ) : (
          <div className="w-20 h-14 rounded-lg border bg-slate-100 flex items-center justify-center shrink-0">
            {session.source === 'video-upload'
              ? <FileVideo className="w-6 h-6 text-slate-400" />
              : <Camera className="w-6 h-6 text-slate-400" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{session.taskName}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskBgClass(session.peakRisk)}`}>
              {riskLabel(session.peakRisk)} Risk
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
              {session.source === 'video-upload' ? 'Video Upload' : 'Live Scan'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />{session.id}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{session.date}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDuration(session.duration)}</span>
            {session.assessor && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{session.assessor}</span>}
            {session.department && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{session.department}</span>}
            {session.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{session.location}</span>}
          </div>
          {session.notes && (
            <p className="text-xs text-muted-foreground mt-1 italic">"{session.notes}"</p>
          )}
        </div>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'RULA', value: session.avgRula, max: 7, result: session.snapshots[0]?.rula },
          { label: 'REBA', value: session.avgReba, max: 15, result: session.snapshots[0]?.reba },
          { label: 'NIOSH LI', value: session.avgNiosh, max: 5, result: session.snapshots[0]?.niosh },
          { label: 'RSI', value: session.avgRsi, max: 100, result: session.snapshots[0]?.rsi },
        ].map(({ label, value, max, result }) => {
          const pct = Math.min(100, (value / max) * 100);
          const rl = result?.riskLevel ?? 'low';
          return (
            <Card key={label} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${riskBgClass(rl)}`}>
                    {riskLabel(rl)}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">{value.toFixed(1)}</p>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: riskColor(rl) }}
                  />
                </div>
                {result?.interpretation && (
                  <p className="text-xs text-muted-foreground mt-2 leading-snug">{result.interpretation}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Timeline Chart */}
      {timelineData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Risk Score Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timelineData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 286.32)" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} tickFormatter={v => `${v}s`} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 15]} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(v: number, name: string) => [v.toFixed(1), name.toUpperCase()]}
                />
                <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={5} stroke="#D97706" strokeDasharray="4 2" label={{ value: 'RULA Action', fontSize: 9, fill: '#D97706' }} />
                <ReferenceLine y={8} stroke="#DC2626" strokeDasharray="4 2" label={{ value: 'REBA High', fontSize: 9, fill: '#DC2626' }} />
                <Line type="monotone" dataKey="rula" stroke="#3B82F6" dot={false} strokeWidth={2} name="RULA" />
                <Line type="monotone" dataKey="reba" stroke="#F59E0B" dot={false} strokeWidth={2} name="REBA" />
                <Line type="monotone" dataKey="overall" stroke="#8B5CF6" dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="Overall" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Body Region Risk Heat Map + Angle Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Heat Map */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Body Region Risk Map</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={bodyRegions}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 60, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.004 286.32)" />
                <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(v: number) => [v.toFixed(1), 'Risk Score']}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {bodyRegions.map((entry, i) => (
                    <Cell key={i} fill={riskColor(entry.riskLevel)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Angle Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Average Joint Angles</CardTitle>
          </CardHeader>
          <CardContent>
            {avgAngles ? (
              <div className="space-y-2">
                {[
                  { label: 'Neck Flexion', value: avgAngles.neckFlexion, threshold: 20, unit: '°' },
                  { label: 'Trunk Flexion', value: avgAngles.trunkFlexion, threshold: 20, unit: '°' },
                  { label: 'L. Shoulder Elevation', value: avgAngles.leftUpperArm, threshold: 45, unit: '°' },
                  { label: 'R. Shoulder Elevation', value: avgAngles.rightUpperArm, threshold: 45, unit: '°' },
                  { label: 'L. Wrist Deviation', value: avgAngles.leftWrist, threshold: 15, unit: '°' },
                  { label: 'R. Wrist Deviation', value: avgAngles.rightWrist, threshold: 15, unit: '°' },
                  { label: 'Hip Flexion', value: avgAngles.hipFlexion, threshold: 60, unit: '°' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-40 shrink-0">{row.label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (row.value / 90) * 100)}%`,
                          backgroundColor: row.value > row.threshold ? '#DC2626' : '#22C55E',
                        }}
                      />
                    </div>
                    <span className={`text-xs font-semibold w-12 text-right ${row.value > row.threshold ? 'text-red-600' : 'text-green-600'}`}>
                      {row.value.toFixed(1)}{row.unit}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No angle data available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              AI-Generated Recommendations
            </CardTitle>
            <p className="text-xs text-muted-foreground">Plain-language guidance based on detected posture and task parameters</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <span className="text-xs font-bold text-amber-600 shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-foreground leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Corrective Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="w-4 h-4 text-sky-500" />
              Corrective Actions
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">{openActions} open</span>
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{completedActions} done</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Auto-generated from risk analysis. Click any action to update its status.</p>
        </CardHeader>
        <CardContent>
          {actions.length > 0 ? (
            <div className="space-y-2">
              {actions.map(action => (
                <ActionRow key={action.id} action={action} onStatusChange={handleStatusChange} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No corrective actions generated.</p>
          )}
        </CardContent>
      </Card>

      {/* Before/After Comparison */}
      {baseline && <ComparisonPanel current={session} baseline={baseline} />}

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:p-4 { padding: 1rem !important; }
          .print\\:space-y-4 > * + * { margin-top: 1rem !important; }
        }
      `}</style>
    </div>
  );
}
