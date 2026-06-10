/**
 * SessionContext — ErgoKit
 * Manages active recording session, snapshot history, and persisted session records.
 */
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import type { ErgoSnapshot, SessionRecord, TaskProfile } from '@/lib/ergo-engine';
import { summarizeSession, DEFAULT_TASK_PROFILE } from '@/lib/ergo-engine';

const STORAGE_KEY = 'ergokit_sessions_v2';

interface SessionContextValue {
  // Active session
  isRecording: boolean;
  sessionDuration: number; // seconds
  currentSnapshots: ErgoSnapshot[];
  taskProfile: TaskProfile;
  setTaskProfile: (p: TaskProfile) => void;
  startRecording: () => void;
  stopRecording: () => SessionRecord | null;
  pushSnapshot: (snap: ErgoSnapshot) => void;

  // Saved sessions
  sessions: SessionRecord[];
  addSession: (record: SessionRecord) => void;
  deleteSession: (id: string) => void;
  clearAllSessions: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [currentSnapshots, setCurrentSnapshots] = useState<ErgoSnapshot[]>([]);
  const [taskProfile, setTaskProfile] = useState<TaskProfile>(DEFAULT_TASK_PROFILE);
  const [sessions, setSessions] = useState<SessionRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: SessionRecord[] = JSON.parse(raw);
      // Migration: backfill fields added after initial release so old stored sessions
      // don't crash the report UI or PDF export.
      return parsed.map(s => ({
        ...s,
        clampedFrames:    (s as any).clampedFrames    ?? 0,
        sustainedPeakRula:(s as any).sustainedPeakRula ?? (s.peakRula ?? Math.round(s.avgRula)),
        sustainedPeakReba:(s as any).sustainedPeakReba ?? (s.peakReba ?? Math.round(s.avgReba)),
      }));
    } catch { return []; }
  });

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Throttle snapshot storage to every 2 seconds
  const lastSnapshotTime = useRef<number>(0);

  // Persist sessions
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
  }, [sessions]);

  const startRecording = useCallback(() => {
    setCurrentSnapshots([]);
    setSessionDuration(0);
    startTimeRef.current = Date.now();
    lastSnapshotTime.current = 0;
    setIsRecording(true);
    timerRef.current = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopRecording = useCallback((): SessionRecord | null => {
    if (!isRecording) return null;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    let record: SessionRecord | null = null;
    setCurrentSnapshots(snaps => {
      if (snaps.length === 0) return snaps;
      record = summarizeSession(snaps, taskProfile, duration);
      setSessions(prev => [record!, ...prev].slice(0, 100)); // keep last 100
      return snaps;
    });
    return record;
  }, [isRecording, taskProfile]);

  const pushSnapshot = useCallback((snap: ErgoSnapshot) => {
    if (!isRecording) return;
    const now = Date.now();
    // Store at most 1 snapshot per 2 seconds to keep memory manageable
    if (now - lastSnapshotTime.current < 2000) return;
    lastSnapshotTime.current = now;
    setCurrentSnapshots(prev => [...prev.slice(-300), snap]); // keep last 300
  }, [isRecording]);

  const addSession = useCallback((record: SessionRecord) => {
    setSessions(prev => [record, ...prev].slice(0, 100));
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
  }, []);

  return (
    <SessionContext.Provider value={{
      isRecording, sessionDuration, currentSnapshots, taskProfile,
      setTaskProfile, startRecording, stopRecording, pushSnapshot,
      sessions, addSession, deleteSession, clearAllSessions,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
