import React, { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { ActivityGroup, MessageBubble } from './ToolEvent';
import { promptSuggestions } from '../../constants';
import { readEvents } from '../../lib/sse';
import { newId } from '../../lib/id';
import type { ChatMessage, HarborSession } from '../../types';
import { useChatMessages } from './useChatMessages';

export function Chat({ sessionId, activeSessionUpdatedAt, sessions, onSessionActivity, onSwitchSession, onArchiveSession, canArchive }: { sessionId: string; activeSessionUpdatedAt?: string; sessions: HarborSession[]; onSessionActivity: () => void | Promise<unknown>; onSwitchSession: (sessionId: string) => void; onArchiveSession: () => void | Promise<void>; canArchive: boolean }) {
  const [suggestion, setSuggestion] = useState<{ id: string; text: string }>();
  const handleSuggestion = useCallback((text: string) => setSuggestion({ id: newId(), text }), []);
  const { messages, busy, loadingOlder, hasOlder, loadOlder, addMessage, appendAssistant, beginSend, finishSend } = useChatMessages({ sessionId, activeSessionUpdatedAt });

  const sendMessage = useCallback(async (message: string) => {
    if (!message || busy) return;
    beginSend();
    addMessage({ id: newId(), role: 'user', text: message, createdAt: new Date().toISOString() });
    const startRes = await fetch('/api/chat/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sessionId }) });
    const startData = await startRes.json();
    if (!startRes.ok || !startData.runId) {
      addMessage({ id: newId(), role: 'event', kind: 'error', text: startData.error ?? `Request failed (${startRes.status})` });
      finishSend();
      return;
    }
    let lastEventId = 0;
    let streamDone = false;
    for (let attempt = 0; attempt < 3 && !streamDone; attempt++) {
      const streamRes = await fetch(`/api/chat/runs/${startData.runId}/events?lastEventId=${lastEventId}`);
      if (!streamRes.ok) {
        addMessage({ id: newId(), role: 'event', kind: 'error', text: `Stream failed (${streamRes.status})` });
        break;
      }
      const result = await readEvents(streamRes, (event, id) => {
        if (id !== undefined) lastEventId = Math.max(lastEventId, id);
        if (event.type === 'assistant_delta' || event.type === 'assistant_message') appendAssistant(event.text);
        if (event.type === 'tool_event') addMessage({ id: newId(), role: 'event', kind: 'tool', text: event.text.trim(), createdAt: new Date().toISOString() });
        if (event.type === 'status') addMessage({ id: newId(), role: 'event', kind: 'status', text: event.text, createdAt: new Date().toISOString() });
        if (event.type === 'error') addMessage({ id: newId(), role: 'event', kind: 'error', text: event.message, createdAt: new Date().toISOString() });
      }, (done) => {
        streamDone = true;
        if (done.sessionId && done.sessionId !== sessionId) onSwitchSession(done.sessionId);
      });
      if (result.lastEventId !== undefined) lastEventId = Math.max(lastEventId, result.lastEventId);
      if (!result.done && !streamDone) {
        const statusRes = await fetch(`/api/chat/runs/${startData.runId}`);
        const statusData = statusRes.ok ? await statusRes.json() : undefined;
        if (statusData?.run?.status !== 'running') streamDone = true;
      }
    }
    finishSend();
    onSessionActivity();
  }, [addMessage, appendAssistant, beginSend, busy, finishSend, onSessionActivity, onSwitchSession, sessionId]);

  const activeSession = sessions.find((session) => session.id === sessionId);
  return <section className="chatScreen"><div className="chatHeader"><div><h2>{activeSession?.name ?? 'Session'}</h2><p><code>/workspace</code> · <span>{sessionId}</span></p></div><div className="chatActions"><button className="ghost" onClick={onArchiveSession} disabled={busy || !canArchive}>Archive</button></div></div><ChatMessageList messages={messages} hasOlder={hasOlder} loadingOlder={loadingOlder} onLoadOlder={loadOlder} onSuggestion={handleSuggestion} /><ChatComposer busy={busy} suggestion={suggestion} onSend={sendMessage} /></section>;
}

type RenderItem = { type: 'message'; message: ChatMessage } | { type: 'activity'; id: string; messages: ChatMessage[] };

const ChatMessageList = memo(function ChatMessageList({ messages, hasOlder, loadingOlder, onLoadOlder, onSuggestion }: { messages: ChatMessage[]; hasOlder: boolean; loadingOlder: boolean; onLoadOlder: () => void | Promise<void>; onSuggestion: (text: string) => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const groupedMessages = useMemo(() => groupChatMessages(messages), [messages]);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), [messages]);
  return <div className="messageList">{hasOlder && <button className="loadOlder" disabled={loadingOlder} onClick={onLoadOlder}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</button>}{messages.length === 0 && <div className="empty"><h3>Start a working session</h3><p>Ask Harbor to inspect files, run commands, review changes, or build something in this workspace.</p><div className="suggestions">{promptSuggestions.map((item) => <button key={item} onClick={() => onSuggestion(item)}>{item}</button>)}</div></div>}{groupedMessages.map((item) => item.type === 'activity' ? <ActivityGroup key={item.id} messages={item.messages} /> : <MessageBubble key={item.message.id} message={item.message} />)}<div ref={bottomRef} /></div>;
});

function ChatComposer({ busy, suggestion, onSend }: { busy: boolean; suggestion?: { id: string; text: string }; onSend: (message: string) => void | Promise<void> }) {
  const [draft, setDraft] = useState('');
  useEffect(() => { if (suggestion) setDraft(suggestion.text); }, [suggestion]);
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setDraft('');
    await onSend(message);
  }
  return <form className="composer" onSubmit={send}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message agent…" /><div className="composerFooter"><span>Enter to send · Shift+Enter for newline</span><button disabled={busy || !draft.trim()}>{busy ? 'Working…' : 'Send ↵'}</button></div></form>;
}

function groupChatMessages(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let toolGroup: ChatMessage[] = [];
  const flushTools = () => {
    if (toolGroup.length === 0) return;
    items.push({ type: 'activity', id: `activity-${toolGroup[0].id}-${toolGroup.length}`, messages: toolGroup });
    toolGroup = [];
  };
  for (const message of messages) {
    if (message.role === 'event' && message.kind === 'tool') {
      toolGroup.push(message);
      continue;
    }
    flushTools();
    if (message.role === 'event' && message.kind === 'status') continue;
    items.push({ type: 'message', message });
  }
  flushTools();
  return items;
}
