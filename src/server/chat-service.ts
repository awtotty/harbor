import { appendMessageText, insertMessage } from './db.js';
import { MessageRouter } from './router.js';
import type { ChannelName, EventSink, HarborEvent } from './types.js';

export type SendChatInput = {
  router: MessageRouter;
  sessionId: string;
  channel: ChannelName;
  senderId: string;
  text: string;
  sink: EventSink;
};

export async function sendChatMessage(input: SendChatInput): Promise<void> {
  const { router, sessionId, channel, senderId, text, sink } = input;
  insertMessage({ id: crypto.randomUUID(), sessionId, role: 'user', channel, senderId, text });
  let assistantMessageId: string | undefined;

  const persistAndSend = (event: HarborEvent) => {
    if (event.type === 'assistant_delta') {
      if (!assistantMessageId) {
        assistantMessageId = crypto.randomUUID();
        insertMessage({ id: assistantMessageId, sessionId, role: 'assistant', channel, senderId: 'pi', text: '' });
      }
      appendMessageText(assistantMessageId, event.text);
    } else if (event.type === 'status') {
      insertMessage({ id: crypto.randomUUID(), sessionId, role: 'event', kind: 'status', channel, senderId: 'harbor', text: event.text });
    } else if (event.type === 'tool_event') {
      insertMessage({ id: crypto.randomUUID(), sessionId, role: 'event', kind: 'tool', channel, senderId: 'pi', text: event.text });
    } else if (event.type === 'error') {
      insertMessage({ id: crypto.randomUUID(), sessionId, role: 'event', kind: 'error', channel, senderId: 'harbor', text: event.message });
    }
    sink(event);
  };

  await router.handle({ channel, senderId, workspaceId: 'default', sessionId, text }, persistAndSend);
}
