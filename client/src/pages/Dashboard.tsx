/**
 * Dashboard — ErgoKit CV Platform
 * Home page: KPI summary, recent sessions, quick-start CTA.
 *
 * FIX 1 (2026-06-06): All RULA/REBA aggregates now use per-session PEAK integer
 * scores (session.peakRula / session.peakReba), not per-frame averages.
 * - Single session → shows the integer directly (no decimal).
 * - Multi-session → shows the average of session peaks, explicitly labeled.
 * - Session Score Trend chart plots peakRula/peakReba (normalized) per session.
 * Rationale: RULA (1–7) and REBA (1–15) are ordinal scales; averaging per-frame
 * scores introduces false precision. The methodologically correct headline value
 * is the peak worst-frame integer, per McAtamney & Corlett 1993 and Hignett &
 * McAtamney 2000.
 */
import { Link } from 'wouter';
import { Camera, ClipboardList, Activity, AlertTriangle, ChevronRight, Zap, Upload, Wrench, FileVideo } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';
import { riskBgClass, riskLabel, riskColor } from '@/lib/ergo-engine';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function Dashboard() {
  const { sessions } = useSession();

  const totalSessions = sessions.length;
  const highRiskSessions = sessions.filter(s => s.peakRisk === 'high' || s.peakRisk === 'very-high').length;

  // FIX 1: Use per-session PEAK integer scores (not per-frame averages).
  // For a single session, this returns the integer directly.
  // For multiple sessions, this is the average of session peaks (labeled explicitly in UI).
  const peakRulaValues = sessions.map(s => s.peakRula ?? Math.round(s.avgRula));
  const peakRebaValues = sessions.map(s => s.peakReba ?? Math.round(s.avgReba));

  // Display value: integer for single session, rounded-to-1dp average for multi-session
  const displayRula = totalSessions === 0 ? 0
    : totalSessions === 1 ? peakRulaValues[0]
    : Math.round((peakRulaValues.reduce((a, b) => a + b, 0) / totalSessions) * 10) / 10;
  const displayReba = totalSessions === 0 ? 0
    : totalSessions === 1 ? peakRebaValues[0]
    : Math.round((peakRebaValues.reduce((a, b) => a + b, 0) / totalSessions) * 10) / 10;

  // Label changes for multi-session to make clear these are averages of peaks
  const rulaLabel = totalSessions <= 1 ? 'PEAK RULA' : 'Avg Peak RULA';
  const rebaLabel = totalSessions <= 1 ? 'PEAK REBA' : 'Avg Peak REBA';

  const openActions = sessions.reduce((sum, s) => sum + (s.actions ?? []).filter(a => a.status === 'open' || a.status === 'in-progress').length, 0);
  const videoSessions = sessions.filter(s => s.source === 'video-upload').length;

  // FIX 1: Chart plots peakRula and normalized peakReba per session (not averages)
  const chartData = sessions.slice(0, 7).reverse().map((s, i) => ({
    name: `S${i + 1}`,
    rula: s.peakRula ?? Math.round(s.avgRula),
    // Normalize REBA to RULA scale (÷15×7) for same-axis comparison
    reba: Math.round(((s.peakReba ?? Math.round(s.avgReba)) / 15 * 7) * 10) / 10,
    risk: s.peakRisk,
  }));

  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>
            Ergonomics Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Computer vision–powered workplace risk monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/upload">
            <Button variant="outline" className="gap-2">
              <Upload className="w-4 h-4" /> Upload Video
            </Button>
          </Link>
          <Link href="/scan">
            <Button className="gap-2 bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white">
              <Camera className="w-4 h-4" /> Live Scan
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Total Assessments" value={totalSessions} icon={<ClipboardList className="w-4 h-4" />} color="blue" />
        <KpiCard label="Video Uploads" value={videoSessions} icon={<FileVideo className="w-4 h-4" />} color="blue" />
        <KpiCard label="High Risk" value={highRiskSessions} icon={<AlertTriangle className="w-4 h-4" />} color={highRiskSessions > 0 ? 'red' : 'green'} />
        <KpiCard label="Open Actions" value={openActions} icon={<Wrench className="w-4 h-4" />} color={openActions > 0 ? 'amber' : 'green'} />
        <KpiCard
          label={rulaLabel}
          value={displayRula}
          icon={<Activity className="w-4 h-4" />}
          color={displayRula >= 5 ? 'red' : displayRula >= 3 ? 'amber' : 'green'}
          suffix="/7"
          isInteger={totalSessions <= 1}
        />
        <KpiCard
          label={rebaLabel}
          value={displayReba}
          icon={<Zap className="w-4 h-4" />}
          color={displayReba >= 8 ? 'red' : displayReba >= 4 ? 'amber' : 'green'}
          suffix="/15"
          isInteger={totalSessions <= 1}
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>Session Score Trend</CardTitle>
            {/* FIX 1: Subtitle now accurately describes what is plotted */}
            <p className="text-xs text-muted-foreground">
              Peak RULA and normalized peak REBA across last 7 sessions
            </p>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                  <YAxis domain={[0, 7]} tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: number, name: string) => {
                      // Show integer for RULA (it's already a peak integer); show 1dp for normalized REBA
                      if (name === 'Peak RULA') return [Math.round(v).toString(), name];
                      return [v.toFixed(1), name];
                    }}
                  />
                  <Bar dataKey="rula" name="Peak RULA" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={riskColor(entry.risk as any)} />
                    ))}
                  </Bar>
                  <Bar dataKey="reba" name="Peak REBA (norm)" fill="oklch(0.62 0.18 220)" radius={[3, 3, 0, 0]} opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-center">
                <Activity className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Run your first scan to see data here</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>Recent Sessions</CardTitle>
              <Link href="/sessions">
                <Button variant="ghost" size="sm" className="text-xs gap-1 text-[oklch(0.62_0.18_220)] h-7 px-2">
                  All <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentSessions.length === 0 ? (
              <div className="px-5 py-8 flex flex-col items-center text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No sessions recorded</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentSessions.map(session => (
                  <Link key={session.id} href={`/sessions/${session.id}`}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: riskColor(session.peakRisk) }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>{session.taskName}</p>
                        <p className="text-xs text-muted-foreground">{session.date} · {formatDuration(session.duration)}</p>
                      </div>
                      <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${riskBgClass(session.peakRisk)}`}>
                        {riskLabel(session.peakRisk)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {totalSessions === 0 && (
        <Card className="shadow-sm border-border bg-[oklch(0.97_0.01_240)]">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>Getting Started with ErgoKit</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { step: '1', title: 'Configure Task', desc: 'Set load weight, rep rate, and NIOSH parameters for your task.', href: '/setup', cta: 'Task Setup' },
                { step: '2', title: 'Upload Video or Live Scan', desc: 'Upload a task video for automated frame-by-frame analysis, or use your live camera for real-time assessment.', href: '/upload', cta: 'Upload Video' },
                { step: '3', title: 'Review Report', desc: 'After recording, view detailed angle analysis and automated recommendations.', href: '/sessions', cta: 'Sessions' },
              ].map(({ step, title, desc, href, cta }) => (
                <div key={step} className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[oklch(0.28_0.07_240)] text-white text-xs font-bold flex items-center justify-center">{step}</div>
                  <div>
                    <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">{desc}</p>
                    <Link href={href}>
                      <Button variant="outline" size="sm" className="text-xs h-7 gap-1">{cta} <ChevronRight className="w-3 h-3" /></Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, color, suffix, isInteger }: {
  label: string; value: number; icon: React.ReactNode;
  color: 'blue' | 'red' | 'amber' | 'green'; suffix?: string;
  /** When true, display as integer (no decimal). Used for single-session peak scores. */
  isInteger?: boolean;
}) {
  const colorMap = { blue: 'bg-blue-50 text-blue-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-green-50 text-green-600' };
  const displayValue = isInteger ? Math.round(value).toString() : value.toString();
  return (
    <Card className="shadow-sm border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>{label}</p>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorMap[color]}`}>{icon}</div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>{displayValue}</span>
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
