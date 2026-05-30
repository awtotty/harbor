import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import { newId } from './id';

export function useChatMessages({ sessionId, activeSessionUpdatedAt }: { sessionId: string; activeSessionUpdatedAt?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const activeAssistantMessageId = useRef<string | undefined>(undefined);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/messages`);
    if (!res.ok) {
      setMessages([{ id: newId(), role: 'event', kind: 'error', text: `Failed to load messages (${res.status})` }]);
      return;
    }
    const data = await res.json();
    const nextMessages = Array.isArray(data.messages) ? data.messages : [];
    setMessages(nextMessages.map((m: any) => ({ id: m.id, role: m.role, kind: m.kind, text: m.text, createdAt: m.createdAt })));
  }, [sessionId]);

  useEffect(() => {
    if (busy) return;
    void loadMessages();
  }, [activeSessionUpdatedAt, busy, loadMessages]);

  const addMessage = useCallback((message: ChatMessage) => setMessages((old) => [...old, message]), []);

  const beginSend = useCallback(() => {
    activeAssistantMessageId.current = undefined;
    setBusy(true);
  }, []);

  const finishSend = useCallback(() => {
    activeAssistantMessageId.current = undefined;
    setBusy(false);
  }, []);

  const appendAssistant = useCallback((text: string) => {
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

  return { messages, busy, addMessage, appendAssistant, beginSend, finishSend, loadMessages };
}
