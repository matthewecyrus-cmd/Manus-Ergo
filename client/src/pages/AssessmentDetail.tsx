/* ============================================================
   AssessmentDetail — ErgoKit
   Full assessment view: scores, body part risk, corrective actions
   ============================================================ */
import { useParams, Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, PolarGrid,
  PolarAngleAxis, Radar
} from "recharts";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, User,
  Building2, Calendar, ClipboardCheck, TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_ASSESSMENTS } from "@/lib/ergo-types";
import type { RiskLevel, CorrectiveAction } from "@/lib/ergo-types";

const RISK_BADGE: Record<RiskLevel, string> = {
  'low': 'bg-green-100 text-green-800 border-green-200',
  'medium': 'bg-amber-100 text-amber-800 border-amber-200',
  'high': 'bg-red-100 text-red-800 border-red-200',
  'very-high': 'bg-red-200 text-red-900 border-red-300',
};
const RISK_LABEL: Record<RiskLevel, string> = {
  'low': 'Low Risk', 'medium': 'Medium Risk', 'high': 'High Risk', 'very-high': 'Very High Risk',
};
const RISK_BG: Record<RiskLevel, string> = {
  'low': 'bg-green-500', 'medium': 'bg-amber-500', 'high': 'bg-red-500', 'very-high': 'bg-red-700',
};
const ACTION_STATUS_BADGE: Record<string, string> = {
  'open': 'bg-slate-100 text-slate-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-100 text-green-700',
};
const ACTION_PRIORITY_BADGE: Record<string, string> = {
  'low': 'bg-green-100 text-green-700',
  'medium': 'bg-amber-100 text-amber-700',
  'high': 'bg-red-100 text-red-700',
  'very-high': 'bg-red-200 text-red-900',
};

function getBarColor(score: number) {
  if (score >= 7) return '#DC2626';
  if (score >= 4) return '#D97706';
  return '#16A34A';
}

export default function AssessmentDetail() {
  const params = useParams<{ id: string }>();
  const assessment = SAMPLE_ASSESSMENTS.find(a => a.id === params.id);

  if (!assessment) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <p className="text-muted-foreground text-sm">Assessment not found.</p>
        <Link href="/assessments">
          <Button variant="ghost" size="sm" className="mt-3 gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Assessments
          </Button>
        </Link>
      </div>
    );
  }

  const radarData = assessment.bodyParts.map(bp => ({
    region: bp.region.split('/')[0],
    score: bp.score,
    fullMark: 10,
  }));

  const openActions = assessment.actions.filter(a => a.status !== 'completed');
  const completedActions = assessment.actions.filter(a => a.status === 'completed');

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Link href="/assessments">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {assessment.title}
            </h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${RISK_BADGE[assessment.overallRisk]}`}>
              {RISK_LABEL[assessment.overallRisk]}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" />{assessment.id}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{assessment.date}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{assessment.assessor}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{assessment.department}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          Export Report
        </Button>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard label="RULA Score" score={assessment.rulaScore} max={7} description="Upper limb posture" />
        <ScoreCard label="REBA Score" score={assessment.rebaScore} max={15} description="Whole body posture" />
        <div className="col-span-2 lg:col-span-2">
          <Card className="shadow-sm border-border h-full">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  Overall Risk Level
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${RISK_BG[assessment.overallRisk]}`} />
                  <span className="text-lg font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {RISK_LABEL[assessment.overallRisk]}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <div className="score-tape w-full" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Low</span><span>Medium</span><span>High</span>
                </div>
              </div>
              {assessment.notes && (
                <p className="text-xs text-muted-foreground mt-3 italic border-l-2 border-amber-400 pl-2">
                  {assessment.notes}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Body part risk + radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Body Part Risk Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={assessment.bodyParts} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.004 240)" />
                <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} width={60} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid oklch(0.90 0.005 240)' }}
                  formatter={(v: number) => [v, 'Risk Score']}
                />
                <Bar dataKey="score" radius={[0, 3, 3, 0]}>
                  {assessment.bodyParts.map((entry, index) => (
                    <Cell key={index} fill={getBarColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Risk Profile Radar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="oklch(0.90 0.005 240)" />
                <PolarAngleAxis dataKey="region" tick={{ fontSize: 10, fill: 'oklch(0.52 0.02 240)' }} />
                <Radar
                  name="Risk"
                  dataKey="score"
                  stroke="oklch(0.28 0.07 240)"
                  fill="oklch(0.28 0.07 240)"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Body part table */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Body Region Detail
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Region', 'Score', 'Risk Level', 'Trend'].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assessment.bodyParts.map(bp => (
                  <tr key={bp.region} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-5 py-3 font-medium text-foreground text-sm">{bp.region}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{bp.score}</span>
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${bp.score * 10}%`, backgroundColor: getBarColor(bp.score) }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${RISK_BADGE[bp.level]}`}>
                        {RISK_LABEL[bp.level]}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {bp.trend === 'up' && <TrendingUp className="w-4 h-4 text-red-500" />}
                      {bp.trend === 'down' && <TrendingDown className="w-4 h-4 text-green-500" />}
                      {bp.trend === 'stable' && <Minus className="w-4 h-4 text-muted-foreground" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Corrective actions */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Corrective Actions
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">{completedActions.length} completed</span>
              <span>·</span>
              <span className="text-amber-600 font-medium">{openActions.length} open</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {assessment.actions.map((action, i) => (
              <ActionRow key={action.id} action={action} index={i + 1} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCard({ label, score, max, description }: { label: string; score: number; max: number; description: string }) {
  const pct = score / max;
  const color = pct >= 0.7 ? 'text-red-600' : pct >= 0.45 ? 'text-amber-600' : 'text-green-600';
  const bg = pct >= 0.7 ? 'bg-red-50' : pct >= 0.45 ? 'bg-amber-50' : 'bg-green-50';
  return (
    <Card className="shadow-sm border-border">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
        <div className={`mt-2 inline-flex items-center justify-center w-14 h-14 rounded-xl ${bg}`}>
          <span className={`text-3xl font-bold ${color}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>{score}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
        <p className="text-xs text-muted-foreground">Max score: {max}</p>
      </CardContent>
    </Card>
  );
}

function ActionRow({ action, index }: { action: CorrectiveAction; index: number }) {
  return (
    <div className="flex items-start gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[oklch(0.28_0.07_240)] flex items-center justify-center text-white text-xs font-bold mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {index}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">{action.description}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_PRIORITY_BADGE[action.priority]}`}>
            {action.priority.charAt(0).toUpperCase() + action.priority.slice(1)} Priority
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ACTION_STATUS_BADGE[action.status]}`}>
            {action.status.replace('-', ' ')}
          </span>
          {action.owner && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />{action.owner}
            </span>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />Due: {action.dueDate}
          </span>
        </div>
      </div>
      {action.status === 'completed' ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-1" />
      ) : (
        <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-1" />
      )}
    </div>
  );
}
