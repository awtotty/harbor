import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HarborSession } from '../types';

export function useSessions(token: string, activeSessionId: string, setActiveSessionId: (id: string) => void) {
  const [sessions, setSessions] = useState<HarborSession[]>([]);
  const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId), [activeSessionId, sessions]);

  const loadSessions = useCallback(async (): Promise<HarborSession[]> => {
    const res = await fetch('/api/sessions', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('harborToken');
        window.location.reload();
      }
      return sessions;
    }
    const data = await res.json();
    const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
    setSessions(nextSessions);
    if (!nextSessions.some((session: HarborSession) => session.id === activeSessionId)) setActiveSessionId(nextSessions[0]?.id ?? '');
    return nextSessions;
  }, [activeSessionId, sessions, setActiveSessionId, token]);

  useEffect(() => { if (token) void loadSessions(); }, [token]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => { void loadSessions(); }, 3000);
    return () => window.clearInterval(timer);
  }, [loadSessions, token]);

  return { sessions, setSessions, activeSession, activeSessionUpdatedAt: activeSession?.updatedAt, loadSessions };
}
