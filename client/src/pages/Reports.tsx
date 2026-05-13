/* ============================================================
   Reports — ErgoKit analytics & reporting page
   Risk distribution · Trend · Department breakdown · Export preview
   ============================================================ */
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { Download, FileText, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SAMPLE_ASSESSMENTS, RISK_TREND_DATA } from "@/lib/ergo-types";

const RISK_COLORS = { low: '#16A34A', medium: '#D97706', high: '#DC2626', 'very-high': '#991B1B' };

// Department risk summary
const deptData = [
  { dept: 'Fabrication', low: 0, medium: 1, high: 1, veryHigh: 1 },
  { dept: 'Production', low: 0, medium: 0, high: 1, veryHigh: 0 },
  { dept: 'Warehouse', low: 0, medium: 0, high: 1, veryHigh: 0 },
  { dept: 'Packaging', low: 0, medium: 1, high: 0, veryHigh: 0 },
  { dept: 'QC', low: 1, medium: 0, high: 0, veryHigh: 0 },
];

// Risk distribution pie
const riskDist = [
  { name: 'Low', value: 1, color: '#16A34A' },
  { name: 'Medium', value: 1, color: '#D97706' },
  { name: 'High', value: 2, color: '#DC2626' },
  { name: 'Very High', value: 1, color: '#991B1B' },
];

// Action status
const actionStatus = [
  { status: 'Open', count: 6, color: '#D97706' },
  { status: 'In Progress', count: 3, color: '#0EA5E9' },
  { status: 'Completed', count: 4, color: '#16A34A' },
];

export default function Reports() {
  function handleExport() {
    toast.info("Export feature coming soon", {
      description: "PDF and CSV export will be available in the next release.",
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Reports & Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ergonomics risk trends, distribution, and department performance — May 2024
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExport}>
            <FileText className="w-3.5 h-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Report preview image */}
      <div className="rounded-xl overflow-hidden border border-border shadow-sm">
        <div className="bg-[oklch(0.28_0.07_240)] px-5 py-3 flex items-center justify-between">
          <p className="text-white text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Sample Ergonomics Assessment Report
          </p>
          <Button size="sm" variant="ghost" className="text-white/70 hover:text-white text-xs gap-1.5" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Download
          </Button>
        </div>
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663605576568/eHTrTdQKX3V34x2c353FEH/ergokit-report-preview-C7qxYFMhQNw8jkHWc5rB3x.webp"
          alt="Sample ergonomics assessment report"
          className="w-full object-cover max-h-96 object-top"
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Assessments', value: SAMPLE_ASSESSMENTS.length, sub: 'Total this period' },
          { label: 'Avg RULA Score', value: (SAMPLE_ASSESSMENTS.reduce((s, a) => s + a.rulaScore, 0) / SAMPLE_ASSESSMENTS.length).toFixed(1), sub: 'Across all assessments' },
          { label: 'Avg REBA Score', value: (SAMPLE_ASSESSMENTS.reduce((s, a) => s + a.rebaScore, 0) / SAMPLE_ASSESSMENTS.length).toFixed(1), sub: 'Across all assessments' },
          { label: 'Risk Reduction', value: '41%', sub: 'vs. 6 months ago' },
        ].map(stat => (
          <Card key={stat.label} className="shadow-sm border-border">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{stat.value}</p>
              <p className="text-xs font-semibold text-foreground mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>{stat.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend */}
        <Card className="shadow-sm border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Risk Score Trend — 6 Months
            </CardTitle>
            <p className="text-xs text-muted-foreground">Overall composite ergonomic risk score over time</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={RISK_TREND_DATA} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={(v: number) => [v.toFixed(1), 'Score']} />
                <ReferenceLine y={7} stroke="#DC2626" strokeDasharray="4 2" strokeWidth={1} />
                <ReferenceLine y={4} stroke="#D97706" strokeDasharray="4 2" strokeWidth={1} />
                <Line type="monotone" dataKey="overall" stroke="oklch(0.28 0.07 240)" strokeWidth={2.5} dot={{ r: 4, fill: 'oklch(0.28 0.07 240)', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk distribution pie */}
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Risk Distribution
            </CardTitle>
            <p className="text-xs text-muted-foreground">By overall risk level</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={riskDist} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                  {riskDist.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {riskDist.map(r => (
                <div key={r.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="text-xs text-muted-foreground">{r.name} ({r.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department breakdown */}
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Risk by Department
            </CardTitle>
            <p className="text-xs text-muted-foreground">Stacked count of assessments by risk level</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deptData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" vertical={false} />
                <XAxis dataKey="dept" tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="low" name="Low" stackId="a" fill="#16A34A" />
                <Bar dataKey="medium" name="Medium" stackId="a" fill="#D97706" />
                <Bar dataKey="high" name="High" stackId="a" fill="#DC2626" />
                <Bar dataKey="veryHigh" name="Very High" stackId="a" fill="#991B1B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Corrective action status */}
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Corrective Action Status
            </CardTitle>
            <p className="text-xs text-muted-foreground">Open, in-progress, and completed actions</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={actionStatus} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.004 240)" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'oklch(0.52 0.02 240)' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="count" name="Actions" radius={[4, 4, 0, 0]}>
                  {actionStatus.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Assessment table */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            All Assessments Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['ID', 'Title', 'Department', 'Date', 'RULA', 'REBA', 'Overall Risk', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ASSESSMENTS.map(a => (
                  <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{a.id}</td>
                    <td className="px-4 py-3 font-medium text-foreground text-xs max-w-48 truncate">{a.title}</td>
                    <td className="px-4 py-3 text-xs text-foreground">{a.department}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.date}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold ${a.rulaScore >= 7 ? 'text-red-600' : a.rulaScore >= 5 ? 'text-amber-600' : 'text-green-600'}`}>{a.rulaScore}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold ${a.rebaScore >= 8 ? 'text-red-600' : a.rebaScore >= 4 ? 'text-amber-600' : 'text-green-600'}`}>{a.rebaScore}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        a.overallRisk === 'low' ? 'bg-green-100 text-green-800 border-green-200' :
                        a.overallRisk === 'medium' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        a.overallRisk === 'high' ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-red-200 text-red-900 border-red-300'
                      }`}>
                        {a.overallRisk.charAt(0).toUpperCase() + a.overallRisk.slice(1).replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        a.status === 'completed' || a.status === 'reviewed' ? 'bg-green-100 text-green-700' :
                        a.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {a.status.replace('-', ' ')}
                      </span>
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
