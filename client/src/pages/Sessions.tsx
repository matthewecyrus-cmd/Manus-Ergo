/**
 * Sessions — ErgoKit
 * ==================
 * Assessment record index: lists all saved sessions (live scan + video upload)
 * with risk badges, source indicator, thumbnail, open action counts, and before/after flag.
 */
import { useState } from 'react';
import { Link } from 'wouter';
import {
  Search, Trash2, FileVideo, Camera, ChevronRight,
  Clock, Calendar, AlertTriangle, CheckCircle2, GitCompare,
  Upload, ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useSession } from '@/contexts/SessionContext';
import { riskBgClass, riskLabel, riskColor } from '@/lib/ergo-engine';
import { toast } from 'sonner';

function formatDuration(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Sessions() {
  const { sessions, deleteSession, clearAllSessions } = useSession();
  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.taskName.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
      || (s.department ?? '').toLowerCase().includes(q) || (s.assessor ?? '').toLowerCase().includes(q);
    const matchRisk = filterRisk === 'all' || s.peakRisk === filterRisk;
    const matchSource = filterSource === 'all' || s.source === filterSource;
    return matchSearch && matchRisk && matchSource;
  });

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteSession(id);
    toast.success('Session deleted');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Assessment Records</h1>
          <p className="text-sm text-muted-foreground">{sessions.length} total · {filtered.length} shown</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/scan">
            <Button size="sm" variant="outline" className="gap-2">
              <Camera className="w-4 h-4" /> Live Scan
            </Button>
          </Link>
          <Link href="/upload">
            <Button size="sm" className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
              <Upload className="w-4 h-4" /> Upload Video
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by task, ID, department…"
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {['all', 'negligible', 'low', 'medium', 'high', 'very-high'].map(r => (
            <button
              key={r}
              onClick={() => setFilterRisk(r)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                filterRisk === r
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {r === 'all' ? 'All Risk' : r.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all', label: 'All' },
            { key: 'camera', label: 'Live' },
            { key: 'video-upload', label: 'Video' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterSource(key)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                filterSource === key
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Session List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
            <ClipboardList className="w-8 h-8 text-slate-300" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">No assessments yet</p>
            <p className="text-sm text-muted-foreground mt-1">Upload a video or start a live scan to begin</p>
          </div>
          <div className="flex gap-2">
            <Link href="/upload">
              <Button size="sm" className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
                <Upload className="w-4 h-4" /> Upload Video
              </Button>
            </Link>
            <Link href="/scan">
              <Button size="sm" variant="outline" className="gap-2">
                <Camera className="w-4 h-4" /> Live Scan
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(session => {
            const openActions = (session.actions ?? []).filter(a => a.status === 'open' || a.status === 'in-progress').length;
            const completedActions = (session.actions ?? []).filter(a => a.status === 'completed' || a.status === 'verified').length;

            return (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Risk bar */}
                      <div
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: riskColor(session.peakRisk) }}
                      />

                      {/* Thumbnail */}
                      {session.thumbnailDataUrl ? (
                        <img
                          src={session.thumbnailDataUrl}
                          alt="Frame"
                          className="w-16 h-12 object-cover rounded-lg border shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-12 rounded-lg border bg-slate-100 flex items-center justify-center shrink-0">
                          {session.source === 'video-upload'
                            ? <FileVideo className="w-5 h-5 text-slate-400" />
                            : <Camera className="w-5 h-5 text-slate-400" />}
                        </div>
                      )}

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">{session.taskName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskBgClass(session.peakRisk)}`}>
                            {riskLabel(session.peakRisk)}
                          </span>
                          {session.source === 'video-upload' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium flex items-center gap-1">
                              <FileVideo className="w-3 h-3" /> Video
                            </span>
                          )}
                          {session.baselineSessionId && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-medium flex items-center gap-1">
                              <GitCompare className="w-3 h-3" /> Reassessment
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          <span className="font-mono">{session.id}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{session.date}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(session.duration)}</span>
                          {session.department && <span>{session.department}</span>}
                          {session.assessor && <span>{session.assessor}</span>}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {[
                            { label: 'RULA', value: session.avgRula },
                            { label: 'REBA', value: session.avgReba },
                            { label: 'NIOSH', value: session.avgNiosh },
                            { label: 'RSI', value: session.avgRsi },
                          ].map(({ label, value }) => (
                            <span key={label} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                              {label}: {value.toFixed(1)}
                            </span>
                          ))}
                          {openActions > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {openActions} open
                            </span>
                          )}
                          {completedActions > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> {completedActions} done
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete + arrow */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => handleDelete(session.id, e)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button
            variant="ghost" size="sm"
            className="text-xs text-muted-foreground hover:text-red-600"
            onClick={() => {
              if (confirm('Delete all sessions? This cannot be undone.')) {
                clearAllSessions();
                toast.success('All sessions cleared');
              }
            }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
          </Button>
        </div>
      )}
    </div>
  );
}
