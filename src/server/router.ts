import type { EventSink, HarborEvent, HarborMessage } from './types.js';
import { PiSessionRegistry } from './pi-session.js';
import { isRuntimeConfigured, runtimeHeaders, runtimeUrl } from './runtime-config.js';

export class MessageRouter {
  constructor(private readonly piSessions = new PiSessionRegistry()) {}

  resetSessions(): void {
    this.piSessions.clear();
  }

  async handle(message: HarborMessage, sink: EventSink): Promise<void> {
    if (isRuntimeConfigured()) return handleViaRuntime(message, sink);
    if (!message.text.trim()) throw new Error('Message text is required');
    sink({ type: 'status', text: `Received ${message.channel} message from ${message.senderId}` });
    await this.piSessions.prompt(message.sessionId || 'default', message.text, sink);
  }
}

async function handleViaRuntime(message: HarborMessage, sink: EventSink): Promise<void> {
  if (!runtimeUrl) throw new Error('Runtime service is not configured');
  const response = await fetch(`${runtimeUrl}/internal/message`, {
    method: 'POST',
    headers: { ...runtimeHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!response.ok || !response.body) throw new Error(`Runtime message failed: ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let runtimeError: string | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const event = JSON.parse(line) as HarborEvent;
        if (event.type === 'error') runtimeError = event.message;
        sink(event);
      }
      newline = buffer.indexOf('\n');
    }
  }
  const tail = buffer.trim();
  if (tail) {
    const event = JSON.parse(tail) as HarborEvent;
    if (event.type === 'error') runtimeError = event.message;
    sink(event);
  }
  if (runtimeError) throw new Error(runtimeError);
}
