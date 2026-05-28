import type { EventSink, HarborMessage } from './types.js';
import { PiSessionRegistry } from './pi-session.js';

export class MessageRouter {
  constructor(private readonly piSessions = new PiSessionRegistry()) {}

  resetSessions(): void {
    this.piSessions.clear();
  }

  async handle(message: HarborMessage, sink: EventSink): Promise<void> {
    if (!message.text.trim()) throw new Error('Message text is required');
    sink({ type: 'status', text: `Received ${message.channel} message from ${message.senderId}` });
    await this.piSessions.prompt(message.sessionId || 'default', message.text, sink);
  }
}
