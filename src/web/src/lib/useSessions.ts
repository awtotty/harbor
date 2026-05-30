import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HarborSession } from '../types';
import { equalByJson } from './shallowEqual';

export function useSessions(authed: boolean, activeSessionId: string, setActiveSessionId: (id: string) => void) {
  const [sessions, setSessions] = useState<HarborSession[]>([]);
  const sessionsRef = useRef<HarborSession[]>([]);
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId), [activeSessionId, sessions]);

  const loadSessions = useCallback(async (): Promise<HarborSession[]> => {
    const res = await fetch('/api/sessions');
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('harborToken');
        window.location.reload();
      }
      return sessionsRef.current;
    }
    const data = await res.json();
    const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
    if (!equalByJson(sessionsRef.current, nextSessions)) {
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
    }
    if (!nextSessions.some((session: HarborSession) => session.id === activeSessionIdRef.current)) setActiveSessionId(nextSessions[0]?.id ?? '');
    return nextSessions;
  }, [setActiveSessionId]);

  useEffect(() => { if (authed) void loadSessions(); }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const timer = window.setInterval(() => { void loadSessions(); }, 3000);
    return () => window.clearInterval(timer);
  }, [authed, loadSessions]);

  return { sessions, setSessions, activeSession, activeSessionUpdatedAt: activeSession?.updatedAt, loadSessions };
}
