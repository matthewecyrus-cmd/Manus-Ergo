/**
 * Sessions — ErgoKit
 * Saved session history with summary cards and export links.
 */
import { Link } from 'wouter';
import { ClipboardList, Trash2, ArrowRight, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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

export default function Sessions() {
  const { sessions, deleteSession, clearAllSessions } = useSession();

  function handleDelete(id: string) {
    deleteSession(id);
    toast.success('Session deleted.');
  }

  function handleClearAll() {
    clearAllSessions();
    toast.success('All sessions cleared.');
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Session History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sessions.length} recorded ergonomics sessions
          </p>
        </div>
        {sessions.length > 0 && (
          <Button variant="outline" size="sm" className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleClearAll}>
            Clear All
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium text-muted-foreground">No sessions recorded yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Go to Live Scan, enable the camera, and press Record to start a session.
          </p>
          <Link href="/scan">
            <Button className="bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2">
              Start Live Scan
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map(session => (
            <Card key={session.id} className="shadow-sm border-border hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="flex items-center gap-4 p-4">
                  {/* Risk indicator bar */}
                  <div className={`flex-shrink-0 w-1.5 self-stretch rounded-full`}
                    style={{ backgroundColor: riskColor(session.peakRisk) }} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {session.taskName}
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${riskBgClass(session.peakRisk)}`}>
                        Peak: {riskLabel(session.peakRisk)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                      <span className="font-mono">{session.id}</span>
                      <span>·</span>
                      <span>{session.date}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(session.duration)}</span>
                      <span>·</span>
                      <span>{session.snapshots.length} snapshots</span>
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="hidden sm:grid grid-cols-4 gap-3 flex-shrink-0">
                    <MiniScore label="RULA" value={session.avgRula} max={7} />
                    <MiniScore label="REBA" value={session.avgReba} max={15} />
                    <MiniScore label="NIOSH" value={session.avgNiosh} max={3} isLI />
                    <MiniScore label="RSI" value={session.avgRsi} max={100} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Link href={`/sessions/${session.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs gap-1 text-[oklch(0.62_0.18_220)]">
                        Report <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniScore({ label, value, max, isLI }: { label: string; value: number; max: number; isLI?: boolean }) {
  const pct = isLI ? Math.min(1, value / max) : value / max;
  const color = pct >= 0.7 ? 'text-red-600' : pct >= 0.45 ? 'text-amber-600' : 'text-green-600';
  return (
    <div className="flex flex-col items-center">
      <span className={`text-base font-bold ${color}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {isLI ? value.toFixed(2) : value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
