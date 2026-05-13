/**
 * Dashboard — ErgoKit CV Platform
 * Home page: KPI summary, recent sessions, quick-start CTA.
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
  const avgRula = totalSessions
    ? Math.round((sessions.reduce((s, x) => s + x.avgRula, 0) / totalSessions) * 10) / 10
    : 0;
  const avgReba = totalSessions
    ? Math.round((sessions.reduce((s, x) => s + x.avgReba, 0) / totalSessions) * 10) / 10
    : 0;
  const openActions = sessions.reduce((sum, s) => sum + (s.actions ?? []).filter(a => a.status === 'open' || a.status === 'in-progress').length, 0);
  const videoSessions = sessions.filter(s => s.source === 'video-upload').length;

  const chartData = sessions.slice(0, 7).reverse().map((s, i) => ({
    name: `S${i + 1}`,
    rula: s.avgRula,
    reba: Math.round(s.avgReba / 15 * 7 * 10) / 10,
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
        <KpiCard label="Avg RULA" value={avgRula} icon={<Activity className="w-4 h-4" />} color={avgRula >= 5 ? 'red' : avgRula >= 3 ? 'amber' : 'green'} suffix="/7" />
        <KpiCard label="Avg REBA" value={avgReba} icon={<Zap className="w-4 h-4" />} color={avgReba >= 8 ? 'red' : avgReba >= 4 ? 'amber' : 'green'} suffix="/15" />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>Session Score Trend</CardTitle>
            <p className="text-xs text-muted-foreground">RULA and normalized REBA across last 7 sessions</p>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                  <YAxis domain={[0, 7]} tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={(v: number) => [v.toFixed(1)]} />
                  <Bar dataKey="rula" name="RULA" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={riskColor(entry.risk as any)} />
                    ))}
                  </Bar>
                  <Bar dataKey="reba" name="REBA (norm)" fill="oklch(0.62 0.18 220)" radius={[3, 3, 0, 0]} opacity={0.6} />
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

function KpiCard({ label, value, icon, color, suffix }: {
  label: string; value: number; icon: React.ReactNode;
  color: 'blue' | 'red' | 'amber' | 'green'; suffix?: string;
}) {
  const colorMap = { blue: 'bg-blue-50 text-blue-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-green-50 text-green-600' };
  return (
    <Card className="shadow-sm border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>{label}</p>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorMap[color]}`}>{icon}</div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground" style={{ fontFamily: "\'DM Sans\', sans-serif" }}>{value}</span>
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
