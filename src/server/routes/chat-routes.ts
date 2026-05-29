import type { FastifyInstance } from 'fastify';
import { sendChatMessage } from '../chat-service.js';
import { handleHarborCommand } from '../commands.js';
import { openSse } from '../sse.js';
import type { RouteContext } from './context.js';

export async function registerChatRoutes(app: FastifyInstance, context: RouteContext) {
  app.post('/api/chat-json', async (request, reply) => {
    const body = request.body as { message?: string; sessionId?: string };
    const message = body.message?.trim();
    if (!message) return reply.code(400).send({ error: 'Missing message' });

    const events: unknown[] = [];
    try {
      const command = await handleHarborCommand({ text: message, channel: 'web', sessionId: body.sessionId || 'default' });
      if (command) return { events: command.events, sessionId: command.sessionId };
      await sendChatMessage({
        router: context.router,
        sessionId: body.sessionId || 'default',
        channel: 'web',
        senderId: 'local-web-user',
        text: message,
        sink: (event) => events.push(event),
      });
      return { events };
    } catch (error) {
      return reply.code(500).send({ events, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/chat', async (request, reply) => {
    const body = request.body as { message?: string; sessionId?: string };
    const message = body.message?.trim();
    if (!message) return reply.code(400).send({ error: 'Missing message' });

    const stream = openSse(reply);
    try {
      const command = await handleHarborCommand({ text: message, channel: 'web', sessionId: body.sessionId || 'default' });
      if (command) {
        for (const event of command.events) stream.emit('event', event);
        return;
      }
      await sendChatMessage({
        router: context.router,
        sessionId: body.sessionId || 'default',
        channel: 'web',
        senderId: 'local-web-user',
        text: message,
        sink: (event) => stream.emit('event', event),
      });
    } catch (error) {
      stream.emit('event', { type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      stream.emit('done', {});
      stream.close();
    }
  });
}
