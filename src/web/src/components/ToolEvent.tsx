import type { ChatMessage } from '../types';

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'event' && message.kind === 'tool') return <ToolEvent text={message.text} />;
  if (message.role === 'event') return <details className={`event ${message.kind}`}><summary>{message.kind === 'status' ? 'Status' : message.kind === 'error' ? 'Error' : 'Event'}</summary><pre>{message.text}</pre></details>;
  return <article className={`bubble ${message.role}`}><div className="avatar">{message.role === 'user' ? 'You' : 'Pi'}</div><div className="bubbleText">{message.text}</div></article>;
}

function ToolEvent({ text }: { text: string }) {
  const parsed = parseToolEvent(text);
  return <details className="toolCard"><summary><span className="toolBadge">{parsed.label}</span><span>{parsed.title}</span></summary>{parsed.fields.length > 0 && <div className="toolFields">{parsed.fields.map((field) => <div key={field.label}><strong>{field.label}</strong><pre>{field.value}</pre></div>)}</div>}<details className="rawEvent"><summary>Raw event</summary><pre>{text}</pre></details></details>;
}

function parseToolEvent(text: string): { label: string; title: string; fields: Array<{ label: string; value: string }> } {
  const match = text.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
  const eventType = match?.[1] ?? 'tool';
  const jsonText = match?.[2] ?? text;
  try {
    const payload = JSON.parse(jsonText);
    const candidate = payload.toolCall ?? payload.toolResult ?? payload.tool ?? payload;
    const name = candidate.name ?? candidate.toolName ?? payload.name ?? payload.toolName ?? eventType;
    const title = titleForToolEvent(eventType, name, candidate);
    const fields = fieldsForToolEvent(candidate, payload);
    return { label: eventType, title, fields };
  } catch {
    return { label: eventType, title: eventType, fields: [{ label: 'Payload', value: jsonText.trim() }] };
  }
}

function titleForToolEvent(eventType: string, name: string, candidate: any): string {
  if (/bash/i.test(name)) return candidate.arguments?.command ?? candidate.command ?? 'bash';
  if (/read/i.test(name)) return candidate.arguments?.path ?? candidate.path ?? 'read';
  if (/write|edit/i.test(name)) return candidate.arguments?.path ?? candidate.path ?? name;
  return name || eventType;
}

function fieldsForToolEvent(candidate: any, payload: any): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];
  const args = candidate.arguments ?? payload.arguments;
  if (args) fields.push({ label: 'Arguments', value: typeof args === 'string' ? args : JSON.stringify(args, null, 2) });
  const result = candidate.result ?? payload.result ?? payload.content ?? payload.output;
  if (result) fields.push({ label: 'Result', value: typeof result === 'string' ? result : JSON.stringify(result, null, 2) });
  const error = candidate.error ?? payload.error;
  if (error) fields.push({ label: 'Error', value: typeof error === 'string' ? error : JSON.stringify(error, null, 2) });
  return fields;
}
