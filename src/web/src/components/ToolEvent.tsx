import { memo, useMemo } from 'react';
import { formatClockTime } from '../lib/time';
import type { ChatMessage } from '../types';

type ParsedToolEvent = {
  label: string;
  title: string;
  toolName: string;
  eventType: string;
  raw: string;
  fields: Array<{ label: string; value: string }>;
};

export const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'event' && message.kind === 'tool') return <ToolEvent text={message.text} />;
  if (message.role === 'event') {
    if (message.kind === 'status') return null;
    return <details className={`event ${message.kind}`}><summary>{message.kind === 'error' ? 'Error' : 'Event'}</summary><pre>{message.text}</pre></details>;
  }
  return <article className={`bubble ${message.role}`}><div className="avatar">{message.role === 'user' ? 'You' : 'Pi'}</div><div className="bubbleText">{message.text}</div><time className="messageTime">{formatClockTime(message.createdAt)}</time></article>;
});

export const ActivityGroup = memo(function ActivityGroup({ messages }: { messages: ChatMessage[] }) {
  const { parsed, visibleEvents, hiddenEvents, summary } = useMemo(() => {
    const parsed = messages.map((message) => parseToolEvent(message.text));
    const visibleEvents = meaningfulEvents(parsed);
    const hiddenEvents = parsed.filter((event) => !visibleEvents.includes(event));
    const summary = summarizeActivity(visibleEvents.length ? visibleEvents : parsed);
    return { parsed, visibleEvents, hiddenEvents, summary };
  }, [messages]);
  return <details className="activityCard"><summary><span className="toolBadge">Activity</span><span>{summary}</span><small>{visibleEvents.length || parsed.length} item{(visibleEvents.length || parsed.length) === 1 ? '' : 's'}</small></summary><div className="activityList">{visibleEvents.map((event, index) => <ToolEventCard key={`${event.eventType}-${index}-${event.title}`} event={event} compact defaultOpen={visibleEvents.length === 1 && index === 0} />)}{hiddenEvents.length > 0 && <details className="rawEvent"><summary>{hiddenEvents.length} low-level event{hiddenEvents.length === 1 ? '' : 's'}</summary><div className="activityList">{hiddenEvents.map((event, index) => <ToolEventCard key={`${event.eventType}-${index}-${event.title}`} event={event} compact />)}</div></details>}</div></details>;
});

function ToolEvent({ text, compact = false, defaultOpen = false }: { text: string; compact?: boolean; defaultOpen?: boolean }) {
  return <ToolEventCard event={parseToolEvent(text)} compact={compact} defaultOpen={defaultOpen} />;
}

function ToolEventCard({ event, compact = false, defaultOpen = false }: { event: ParsedToolEvent; compact?: boolean; defaultOpen?: boolean }) {
  return <details className={compact ? 'toolCard compact' : 'toolCard'} open={defaultOpen}><summary><span className="toolBadge">{event.label}</span><span>{event.title}</span></summary>{event.fields.length > 0 ? <div className="toolFields">{event.fields.map((field) => <div key={field.label}><strong>{field.label}</strong><pre>{field.value}</pre></div>)}</div> : <pre className="rawEventText">{event.raw}</pre>}</details>;
}

function parseToolEvent(text: string): ParsedToolEvent {
  const match = text.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
  const eventType = match?.[1] ?? 'tool';
  const jsonText = match?.[2] ?? text;
  try {
    const payload = JSON.parse(jsonText);
    const candidate = payload.toolCall ?? payload.toolResult ?? payload.tool ?? payload;
    const name = candidate.name ?? candidate.toolName ?? payload.name ?? payload.toolName ?? eventType;
    const title = titleForToolEvent(eventType, name, candidate, payload);
    const fields = fieldsForToolEvent(candidate, payload, eventType);
    return { label: labelForEvent(eventType), title, toolName: name, eventType, raw: text, fields };
  } catch {
    return { label: labelForEvent(eventType), title: eventType, toolName: eventType, eventType, raw: text, fields: [{ label: 'Payload', value: jsonText.trim() }] };
  }
}

function meaningfulEvents(events: ParsedToolEvent[]): ParsedToolEvent[] {
  const meaningful = events.filter((event) => !isLowLevelEvent(event));
  const byCall = new Map<string, ParsedToolEvent>();
  for (const event of meaningful) {
    const key = `${event.toolName}:${event.title}`;
    const existing = byCall.get(key);
    if (!existing || rankEvent(event) >= rankEvent(existing)) byCall.set(key, event);
  }
  return [...byCall.values()];
}

function isLowLevelEvent(event: ParsedToolEvent): boolean {
  return /delta|partial|chunk|text_/i.test(event.eventType) || event.eventType === 'toolcall_start';
}

function rankEvent(event: ParsedToolEvent): number {
  if (/error/i.test(event.eventType)) return 4;
  if (/end|result|complete|success/i.test(event.eventType)) return 3;
  if (/start|call/i.test(event.eventType)) return 2;
  return 1;
}

function summarizeActivity(events: ParsedToolEvent[]): string {
  const counts = events.reduce((acc, event) => {
    const name = event.toolName.toLowerCase();
    if (name.includes('read')) acc.read += 1;
    else if (name.includes('bash')) acc.bash += 1;
    else if (name.includes('edit') || name.includes('write')) acc.edit += 1;
    else acc.other += 1;
    return acc;
  }, { read: 0, bash: 0, edit: 0, other: 0 });
  const parts = [
    counts.read ? `read ${counts.read} file${counts.read === 1 ? '' : 's'}` : '',
    counts.bash ? `ran ${counts.bash} command${counts.bash === 1 ? '' : 's'}` : '',
    counts.edit ? `edited ${counts.edit} file${counts.edit === 1 ? '' : 's'}` : '',
    counts.other ? `${counts.other} other action${counts.other === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'agent activity';
}

function labelForEvent(eventType: string): string {
  if (/error/i.test(eventType)) return 'Error';
  if (/end|result|complete|success/i.test(eventType)) return 'Done';
  if (/start|call/i.test(eventType)) return 'Tool';
  return 'Event';
}

function titleForToolEvent(eventType: string, name: string, candidate: any, payload: any): string {
  const args = candidate.arguments ?? payload.arguments ?? candidate.input ?? payload.input;
  if (/bash/i.test(name)) return args?.command ?? candidate.command ?? payload.command ?? 'bash';
  if (/read/i.test(name)) return args?.path ?? candidate.path ?? payload.path ?? 'read';
  if (/write|edit/i.test(name)) return args?.path ?? candidate.path ?? payload.path ?? name;
  return name || eventType;
}

function fieldsForToolEvent(candidate: any, payload: any, eventType: string): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];
  const args = candidate.arguments ?? payload.arguments ?? candidate.input ?? payload.input;
  if (args && !/end|result|complete|success/i.test(eventType)) fields.push({ label: 'Arguments', value: stringify(args) });
  const error = candidate.error ?? payload.error;
  if (error) fields.push({ label: 'Error', value: stringify(error) });
  const result = candidate.result ?? payload.result ?? payload.content ?? payload.output;
  if (result && /error/i.test(eventType)) fields.push({ label: 'Result', value: stringify(result) });
  return fields;
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
