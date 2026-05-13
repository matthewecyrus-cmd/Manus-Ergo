/**
 * SessionReport — ErgoKit
 * Full session analysis: score timeline, body part risk, corrective recommendations, export.
 */
import { useParams, Link } from 'wouter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { ArrowLeft, Download, Printer, Clock, Calendar, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';
import { riskBgClass, riskLabel, riskColor } from '@/lib/ergo-engine';
import { toast } from 'sonner';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function SessionReport() {
  const { id } = useParams<{ id: string }>();
  const { sessions } = useSession();
  const session = sessions.find(s => s.id === id);

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

  // Build timeline data (sample every nth snapshot for chart)
  const step = Math.max(1, Math.floor(session.snapshots.length / 60));
  const timelineData = session.snapshots
    .filter((_, i) => i % step === 0)
    .map((snap, i) => ({
      t: i,
      rula: snap.rula.score,
      reba: snap.reba.score / 15 * 7, // normalize to RULA scale for comparison
      overall: snap.overallScore,
    }));

  // Angle averages
  const avgAngles = session.snapshots.length > 0 ? {
    neckFlexion: avg(session.snapshots.map(s => s.angles.neckFlexion)),
    trunkFlexion: avg(session.snapshots.map(s => s.angles.trunkFlexion)),
    leftUpperArm: avg(session.snapshots.map(s => s.angles.leftUpperArm)),
    rightUpperArm: avg(session.snapshots.map(s => s.angles.rightUpperArm)),
    leftWrist: avg(session.snapshots.map(s => s.angles.leftWrist)),
    rightWrist: avg(session.snapshots.map(s => s.angles.rightWrist)),
    hipFlexion: avg(session.snapshots.map(s => s.angles.hipFlexion)),
    trunkRotation: avg(session.snapshots.map(s => s.angles.trunkRotation)),
  } : null;

  // Recommendations
  const recommendations = generateRecommendations(session.avgRula, session.avgReba, avgAngles);

  function handleExport() {
    toast.info('PDF export coming soon', {
      description: 'Use your browser\'s Print function (Ctrl+P) to save as PDF.',
    });
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto" id="session-report">
      {/* Back */}
      <Link href="/sessions">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Sessions
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {session.taskName}
            </h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${riskBgClass(session.peakRisk)}`}>
              Peak: {riskLabel(session.peakRisk)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
            <span className="font-mono">{session.id}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{session.date}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(session.duration)}</span>
            <span>·</span>
            <span>{session.snapshots.length} data points</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="RULA (avg)" value={session.avgRula} max={7} unit="" />
        <SummaryCard label="REBA (avg)" value={session.avgReba} max={15} unit="" />
        <SummaryCard label="NIOSH LI" value={session.avgNiosh} max={3} unit="" isLI />
        <SummaryCard label="RSI (avg)" value={session.avgRsi} max={100} unit="" />
      </div>

      {/* Timeline chart */}
      {timelineData.length > 1 && (
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Risk Score Timeline
            </CardTitle>
            <p className="text-xs text-muted-foreground">RULA, normalized REBA, and overall composite score over session duration</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'oklch(0.52 0.02 240)' }} label={{ value: 'Sample', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={(v: number) => [v.toFixed(1)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={7} stroke="#DC2626" strokeDasharray="4 2" strokeWidth={1} />
                <ReferenceLine y={4} stroke="#D97706" strokeDasharray="4 2" strokeWidth={1} />
                <Line type="monotone" dataKey="rula" name="RULA" stroke="oklch(0.28 0.07 240)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="reba" name="REBA (norm)" stroke="#D97706" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="overall" name="Overall" stroke="#16A34A" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Angle averages */}
      {avgAngles && (
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Average Body Angles
            </CardTitle>
            <p className="text-xs text-muted-foreground">Mean joint angles recorded during the session</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['Body Region', 'Avg Angle', 'Threshold', 'Status'].map(h => (
                      <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { region: 'Neck Flexion', angle: avgAngles.neckFlexion, warn: 20, danger: 30 },
                    { region: 'Trunk Flexion', angle: avgAngles.trunkFlexion, warn: 20, danger: 60 },
                    { region: 'Trunk Rotation', angle: avgAngles.trunkRotation, warn: 15, danger: 30 },
                    { region: 'Left Upper Arm', angle: avgAngles.leftUpperArm, warn: 45, danger: 90 },
                    { region: 'Right Upper Arm', angle: avgAngles.rightUpperArm, warn: 45, danger: 90 },
                    { region: 'Left Wrist', angle: avgAngles.leftWrist, warn: 15, danger: 30 },
                    { region: 'Right Wrist', angle: avgAngles.rightWrist, warn: 15, danger: 30 },
                    { region: 'Hip Flexion', angle: avgAngles.hipFlexion, warn: 45, danger: 90 },
                  ].map(row => {
                    const status = row.angle >= row.danger ? 'high' : row.angle >= row.warn ? 'medium' : 'low';
                    return (
                      <tr key={row.region} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-5 py-3 font-medium text-foreground text-sm">{row.region}</td>
                        <td className="px-5 py-3 font-mono font-bold text-foreground">{Math.round(row.angle)}°</td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">&gt;{row.danger}° = high risk</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            status === 'high' ? 'bg-red-100 text-red-800 border-red-200' :
                            status === 'medium' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            'bg-green-100 text-green-800 border-green-200'
                          }`}>
                            {status === 'high' ? 'High Risk' : status === 'medium' ? 'Caution' : 'Acceptable'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Automated Recommendations
          </CardTitle>
          <p className="text-xs text-muted-foreground">Generated by ErgoKit Hybrid Inference Engine based on session data</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-4 px-5 py-3.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[oklch(0.28_0.07_240)] flex items-center justify-center text-white text-xs font-bold mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{rec.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rec.detail}</p>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5 ${
                  rec.priority === 'high' ? 'bg-red-100 text-red-800 border-red-200' :
                  rec.priority === 'medium' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-green-100 text-green-800 border-green-200'
                }`}>
                  {rec.priority}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Task profile used */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Task Profile Used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              ['Load Weight', `${session.taskProfile.loadWeight} kg`],
              ['Rep Rate', `${session.taskProfile.repRate}/min`],
              ['Cycle Duration', `${session.taskProfile.cycleDuration}s`],
              ['Coupling', session.taskProfile.coupling],
              ['Duration', session.taskProfile.duration],
              ['Dominant Side', session.taskProfile.dominantSide],
              ['H. Distance', `${session.taskProfile.horizontalDistance} cm`],
              ['V. Origin', `${session.taskProfile.verticalOrigin} cm`],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="font-medium text-foreground capitalize">{v}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function SummaryCard({ label, value, max, unit, isLI }: {
  label: string; value: number; max: number; unit: string; isLI?: boolean;
}) {
  const pct = isLI ? Math.min(1, value / max) : value / max;
  const color = pct >= 0.7 ? 'text-red-600' : pct >= 0.45 ? 'text-amber-600' : 'text-green-600';
  const bg = pct >= 0.7 ? 'bg-red-50' : pct >= 0.45 ? 'bg-amber-50' : 'bg-green-50';
  return (
    <Card className="shadow-sm border-border">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
        <div className={`mt-2 inline-flex items-center justify-center w-14 h-14 rounded-xl ${bg}`}>
          <span className={`text-2xl font-bold ${color}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {isLI ? value.toFixed(2) : value}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: pct >= 0.7 ? '#DC2626' : pct >= 0.45 ? '#D97706' : '#16A34A' }} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Max: {max}{unit}</p>
      </CardContent>
    </Card>
  );
}

interface Recommendation { title: string; detail: string; priority: 'high' | 'medium' | 'low'; }

function generateRecommendations(
  avgRula: number,
  avgReba: number,
  angles: Record<string, number> | null,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (avgRula >= 5) {
    recs.push({
      title: 'Reduce upper limb loading',
      detail: 'RULA score indicates significant upper limb risk. Consider lowering work surface height, using arm supports, or rotating tasks to reduce sustained arm elevation.',
      priority: 'high',
    });
  }
  if (avgReba >= 8) {
    recs.push({
      title: 'Whole-body posture redesign required',
      detail: 'REBA score indicates high whole-body ergonomic risk. Evaluate workstation height, reach distances, and load handling technique immediately.',
      priority: 'high',
    });
  }
  if (angles && angles.neckFlexion > 25) {
    recs.push({
      title: 'Adjust monitor / work surface height',
      detail: `Average neck flexion of ${Math.round(angles.neckFlexion)}° exceeds the 20° threshold. Raise the work surface or screen to bring the neck to a neutral position.`,
      priority: angles.neckFlexion > 35 ? 'high' : 'medium',
    });
  }
  if (angles && angles.trunkFlexion > 30) {
    recs.push({
      title: 'Reduce trunk forward flexion',
      detail: `Average trunk flexion of ${Math.round(angles.trunkFlexion)}° increases lumbar disc pressure. Raise the work surface, use a sit-stand desk, or reposition materials closer to the worker.`,
      priority: angles.trunkFlexion > 60 ? 'high' : 'medium',
    });
  }
  if (angles && Math.max(angles.leftUpperArm, angles.rightUpperArm) > 60) {
    recs.push({
      title: 'Lower arm elevation',
      detail: 'Sustained arm elevation above 60° significantly increases shoulder fatigue and injury risk. Reposition the work surface or use mechanical assists.',
      priority: 'medium',
    });
  }
  if (angles && Math.max(angles.leftWrist, angles.rightWrist) > 20) {
    recs.push({
      title: 'Improve wrist posture',
      detail: 'Wrist deviation above 15° increases carpal tunnel and tendinitis risk. Adjust tool angle, grip orientation, or use ergonomic tool handles.',
      priority: 'medium',
    });
  }
  if (recs.length === 0) {
    recs.push({
      title: 'Posture within acceptable limits',
      detail: 'No critical ergonomic risks identified during this session. Continue monitoring and reassess if task demands change.',
      priority: 'low',
    });
  }
  return recs;
}
