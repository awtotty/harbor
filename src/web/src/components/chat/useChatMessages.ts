import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../types';
import { newId } from '../../lib/id';

const PAGE_SIZE = 40;

export function useChatMessages({ sessionId, activeSessionUpdatedAt }: { sessionId: string; activeSessionUpdatedAt?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const activeAssistantMessageId = useRef<string | undefined>(undefined);
  const assistantDeltaBuffer = useRef('');
  const assistantFlushTimer = useRef<number | undefined>(undefined);

  const normalize = (items: any[]): ChatMessage[] => items.map((m: any) => ({ id: m.id, role: m.role, kind: m.kind, text: m.text, createdAt: m.createdAt }));

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/messages?limit=${PAGE_SIZE}`);
    if (!res.ok) {
      setMessages([{ id: newId(), role: 'event', kind: 'error', text: `Failed to load messages (${res.status})` }]);
      setHasOlder(false);
      return;
    }
    const data = await res.json();
    const nextMessages = normalize(Array.isArray(data.messages) ? data.messages : []);
    setMessages(nextMessages);
    setHasOlder(Boolean(data.hasMore));
  }, [sessionId]);

  const loadOlder = useCallback(async () => {
    const first = messages[0];
    if (!first?.createdAt || !first.id || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(first.createdAt)}&beforeId=${encodeURIComponent(first.id)}`);
      if (!res.ok) return;
      const data = await res.json();
      const older = normalize(Array.isArray(data.messages) ? data.messages : []);
      setMessages((current) => [...older.filter((item) => !current.some((existing) => existing.id === item.id)), ...current]);
      setHasOlder(Boolean(data.hasMore) && older.length > 0);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, messages, sessionId]);

  useEffect(() => {
    if (busy) return;
    void loadMessages();
  }, [activeSessionUpdatedAt, busy, loadMessages]);

  const addMessage = useCallback((message: ChatMessage) => setMessages((old) => [...old, message]), []);

  const flushAssistant = useCallback(() => {
    assistantFlushTimer.current = undefined;
    const text = assistantDeltaBuffer.current;
    assistantDeltaBuffer.current = '';
    if (!text) return;
    setMessages((old) => {
      const existingId = activeAssistantMessageId.current;
      if (existingId) {
        const existingIndex = old.findIndex((message) => message.id === existingId);
        if (existingIndex !== -1) {
          const next = [...old];
          const existing = next[existingIndex];
          next[existingIndex] = { ...existing, text: existing.text + text };
          return next;
        }
      }
      const message = { id: newId(), role: 'assistant' as const, text, createdAt: new Date().toISOString() };
      activeAssistantMessageId.current = message.id;
      return [...old, message];
    });
  }, []);

  const beginSend = useCallback(() => {
    activeAssistantMessageId.current = undefined;
    assistantDeltaBuffer.current = '';
    if (assistantFlushTimer.current !== undefined) window.clearTimeout(assistantFlushTimer.current);
    assistantFlushTimer.current = undefined;
    setBusy(true);
  }, []);

  const finishSend = useCallback(() => {
    if (assistantFlushTimer.current !== undefined) window.clearTimeout(assistantFlushTimer.current);
    flushAssistant();
    activeAssistantMessageId.current = undefined;
    setBusy(false);
  }, [flushAssistant]);

  const appendAssistant = useCallback((text: string) => {
    assistantDeltaBuffer.current += text;
    if (assistantFlushTimer.current === undefined) assistantFlushTimer.current = window.setTimeout(flushAssistant, 50);
  }, [flushAssistant]);

  return { messages, busy, loadingOlder, hasOlder, loadOlder, addMessage, appendAssistant, beginSend, finishSend, loadMessages };
}
