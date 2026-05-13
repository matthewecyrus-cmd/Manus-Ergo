/* ============================================================
   Dashboard — ErgoKit Clinical Dashboard
   KPI cards · Risk trend chart · Body part risk bars · Recent assessments
   ============================================================ */
import { Link } from "wouter";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { ClipboardList, TrendingDown, AlertTriangle, CheckCircle2, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAMPLE_ASSESSMENTS, RISK_TREND_DATA, getRiskColor } from "@/lib/ergo-types";
import type { RiskLevel } from "@/lib/ergo-types";

const RISK_BADGE: Record<RiskLevel, string> = {
  'low': 'bg-green-100 text-green-800 border-green-200',
  'medium': 'bg-amber-100 text-amber-800 border-amber-200',
  'high': 'bg-red-100 text-red-800 border-red-200',
  'very-high': 'bg-red-200 text-red-900 border-red-300',
};
const RISK_LABEL: Record<RiskLevel, string> = {
  'low': 'Low', 'medium': 'Medium', 'high': 'High', 'very-high': 'Very High',
};
const STATUS_BADGE: Record<string, string> = {
  'draft': 'bg-slate-100 text-slate-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-100 text-green-700',
  'reviewed': 'bg-purple-100 text-purple-700',
};

// Body part aggregated risk
const bodyPartData = [
  { region: 'Neck', avg: 5.2 },
  { region: 'Shoulders', avg: 5.6 },
  { region: 'Upper Back', avg: 5.4 },
  { region: 'Lower Back', avg: 6.4 },
  { region: 'Elbows', avg: 3.8 },
  { region: 'Wrists', avg: 5.6 },
  { region: 'Hips', avg: 3.6 },
  { region: 'Knees', avg: 2.8 },
  { region: 'Ankles', avg: 1.8 },
];

function getBarColor(avg: number) {
  if (avg >= 7) return '#DC2626';
  if (avg >= 4) return '#D97706';
  return '#16A34A';
}

export default function Dashboard() {
  const totalAssessments = SAMPLE_ASSESSMENTS.length;
  const highRisk = SAMPLE_ASSESSMENTS.filter(a => a.overallRisk === 'high' || a.overallRisk === 'very-high').length;
  const completed = SAMPLE_ASSESSMENTS.filter(a => a.status === 'completed' || a.status === 'reviewed').length;
  const openActions = SAMPLE_ASSESSMENTS.flatMap(a => a.actions).filter(a => a.status !== 'completed').length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Ergonomics Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview of workplace ergonomics risk across all departments — May 2024
          </p>
        </div>
        <Link href="/assessments/new">
          <Button className="bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2 hidden sm:flex">
            New Assessment
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Hero banner */}
      <div className="relative rounded-xl overflow-hidden h-44 sm:h-52">
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663605576568/eHTrTdQKX3V34x2c353FEH/ergokit-hero-banner-DGDt8CkhzQZbCmhxLGQKcB.webp"
          alt="ErgoKit Dashboard"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[oklch(0.28_0.07_240)]/80 via-[oklch(0.28_0.07_240)]/40 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center px-8">
          <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Current Period Risk Score
          </p>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>5.0</span>
            <span className="text-white/70 text-sm">/ 10</span>
            <div className="flex items-center gap-1 text-green-300 text-sm font-medium">
              <ArrowDownRight className="w-4 h-4" />
              <span>–1.0 from last month</span>
            </div>
          </div>
          <div className="mt-3 w-64 h-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-green-400 via-amber-400 to-red-500" style={{ width: '50%' }} />
          </div>
          <p className="text-white/60 text-xs mt-1.5">Composite ergonomic risk index — all departments</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<ClipboardList className="w-5 h-5" />}
          label="Total Assessments"
          value={totalAssessments}
          sub="This period"
          color="text-[oklch(0.28_0.07_240)]"
          bg="bg-slate-50"
        />
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="High / Very High Risk"
          value={highRisk}
          sub={`${Math.round(highRisk / totalAssessments * 100)}% of total`}
          color="text-red-600"
          bg="bg-red-50"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Completed"
          value={completed}
          sub={`${Math.round(completed / totalAssessments * 100)}% completion rate`}
          color="text-green-600"
          bg="bg-green-50"
        />
        <KpiCard
          icon={<TrendingDown className="w-5 h-5" />}
          label="Open Actions"
          value={openActions}
          sub="Corrective actions pending"
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk trend */}
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Overall Risk Score Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">6-month rolling average composite score</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={RISK_TREND_DATA} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid oklch(0.90 0.005 240)' }}
                  formatter={(v: number) => [v.toFixed(1), 'Risk Score']}
                />
                <ReferenceLine y={7} stroke="#DC2626" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'High', position: 'right', fontSize: 10, fill: '#DC2626' }} />
                <ReferenceLine y={4} stroke="#D97706" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Med', position: 'right', fontSize: 10, fill: '#D97706' }} />
                <Line
                  type="monotone"
                  dataKey="overall"
                  stroke="oklch(0.28 0.07 240)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: 'oklch(0.28 0.07 240)', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Body part risk */}
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Body Part Risk Distribution
            </CardTitle>
            <p className="text-xs text-muted-foreground">Average risk score by anatomical region</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bodyPartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" vertical={false} />
                <XAxis dataKey="region" tick={{ fontSize: 10, fill: 'oklch(0.52 0.02 240)' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid oklch(0.90 0.005 240)' }}
                  formatter={(v: number) => [v.toFixed(1), 'Avg Score']}
                />
                <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                  {bodyPartData.map((entry, index) => (
                    <Cell key={index} fill={getBarColor(entry.avg)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent assessments */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Recent Assessments
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Latest ergonomics evaluations across all departments</p>
          </div>
          <Link href="/assessments">
            <Button variant="ghost" size="sm" className="text-xs gap-1 text-[oklch(0.62_0.18_220)]">
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>Assessment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Department</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">RULA</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">REBA</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ASSESSMENTS.map((a, i) => (
                  <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-foreground text-sm leading-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.id} · {a.date}</p>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-foreground">{a.department}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <ScorePill score={a.rulaScore} max={7} />
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <ScorePill score={a.rebaScore} max={15} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${RISK_BADGE[a.overallRisk]}`}>
                        {RISK_LABEL[a.overallRisk]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[a.status]}`}>
                        {a.status.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link href={`/assessments/${a.id}`}>
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-[oklch(0.62_0.18_220)]">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color, bg }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <Card className="shadow-sm border-border animate-card-in">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`p-2 rounded-lg ${bg}`}>
            <div className={color}>{icon}</div>
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{value}</p>
          <p className="text-xs font-semibold text-foreground mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ScorePill({ score, max }: { score: number; max: number }) {
  const pct = score / max;
  const color = pct >= 0.7 ? 'text-red-700 bg-red-50' : pct >= 0.45 ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50';
  return (
    <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}
