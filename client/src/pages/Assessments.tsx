/* ============================================================
   Assessments — ErgoKit list page
   Search · Filter by risk/status · Assessment cards
   ============================================================ */
import { useState } from "react";
import { Link } from "wouter";
import { Search, Plus, Filter, ClipboardList, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SAMPLE_ASSESSMENTS } from "@/lib/ergo-types";
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

export default function Assessments() {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = SAMPLE_ASSESSMENTS.filter(a => {
    const matchSearch = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.department.toLowerCase().includes(search.toLowerCase()) ||
      a.worker.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase());
    const matchRisk = riskFilter === 'all' || a.overallRisk === riskFilter;
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchRisk && matchStatus;
  });

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Assessments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {SAMPLE_ASSESSMENTS.length} ergonomics assessments on record
          </p>
        </div>
        <Link href="/assessments/new">
          <Button className="bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2">
            <Plus className="w-4 h-4" />
            New Assessment
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assessments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <FilterChip label="All Risk" value="all" current={riskFilter} onClick={setRiskFilter} />
          <FilterChip label="Low" value="low" current={riskFilter} onClick={setRiskFilter} color="text-green-700 bg-green-50 border-green-200" />
          <FilterChip label="Medium" value="medium" current={riskFilter} onClick={setRiskFilter} color="text-amber-700 bg-amber-50 border-amber-200" />
          <FilterChip label="High" value="high" current={riskFilter} onClick={setRiskFilter} color="text-red-700 bg-red-50 border-red-200" />
          <FilterChip label="Very High" value="very-high" current={riskFilter} onClick={setRiskFilter} color="text-red-900 bg-red-100 border-red-300" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <FilterChip label="All Status" value="all" current={statusFilter} onClick={setStatusFilter} />
          <FilterChip label="In Progress" value="in-progress" current={statusFilter} onClick={setStatusFilter} />
          <FilterChip label="Completed" value="completed" current={statusFilter} onClick={setStatusFilter} />
          <FilterChip label="Reviewed" value="reviewed" current={statusFilter} onClick={setStatusFilter} />
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {SAMPLE_ASSESSMENTS.length} assessments
      </p>

      {/* Assessment cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No assessments found</p>
          <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(a => (
            <Card key={a.id} className="shadow-sm border-border hover:shadow-md transition-shadow animate-card-in">
              <CardContent className="p-0">
                <div className="flex items-center gap-4 p-4">
                  {/* Risk indicator */}
                  <div className={`flex-shrink-0 w-1.5 self-stretch rounded-full ${
                    a.overallRisk === 'very-high' ? 'bg-red-700' :
                    a.overallRisk === 'high' ? 'bg-red-500' :
                    a.overallRisk === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                  }`} />

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="font-semibold text-foreground text-sm leading-snug" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {a.title}
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${RISK_BADGE[a.overallRisk]}`}>
                        {RISK_LABEL[a.overallRisk]} Risk
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[a.status]}`}>
                        {a.status.replace('-', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{a.id}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{a.department}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{a.date}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{a.assessor}</span>
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                    <ScoreBlock label="RULA" score={a.rulaScore} max={7} />
                    <ScoreBlock label="REBA" score={a.rebaScore} max={15} />
                  </div>

                  {/* Actions count */}
                  <div className="hidden md:flex flex-col items-center flex-shrink-0">
                    <span className="text-lg font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {a.actions.filter(x => x.status !== 'completed').length}
                    </span>
                    <span className="text-xs text-muted-foreground">open actions</span>
                  </div>

                  {/* CTA */}
                  <Link href={`/assessments/${a.id}`}>
                    <Button variant="ghost" size="sm" className="flex-shrink-0 gap-1 text-[oklch(0.62_0.18_220)]">
                      View <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, value, current, onClick, color }: {
  label: string; value: string; current: string; onClick: (v: string) => void; color?: string;
}) {
  const isActive = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 ${
        isActive
          ? 'bg-[oklch(0.28_0.07_240)] text-white border-[oklch(0.28_0.07_240)]'
          : color
            ? `${color} hover:opacity-80`
            : 'bg-white text-muted-foreground border-border hover:bg-muted'
      }`}
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {label}
    </button>
  );
}

function ScoreBlock({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = score / max;
  const color = pct >= 0.7 ? 'text-red-700' : pct >= 0.45 ? 'text-amber-700' : 'text-green-700';
  return (
    <div className="flex flex-col items-center">
      <span className={`text-lg font-bold ${color}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>{score}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
