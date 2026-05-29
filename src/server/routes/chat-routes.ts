import type { FastifyInstance } from 'fastify';
import { startChatRun, getChatRun, getChatRunSnapshot, snapshotRun } from '../chat-runs.js';
import { openSse } from '../sse.js';
import type { RouteContext } from './context.js';

export async function registerChatRoutes(app: FastifyInstance, context: RouteContext) {
  app.post('/api/chat/start', async (request, reply) => {
    const body = request.body as { message?: string; sessionId?: string };
    const message = body.message?.trim();
    if (!message) return reply.code(400).send({ error: 'Missing message' });
    const run = startChatRun({ router: context.router, sessionId: body.sessionId || 'default', message });
    return { runId: run.id, sessionId: run.sessionId };
  });

  app.get('/api/chat/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = getChatRunSnapshot(runId);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    return { run };
  });

  app.get('/api/chat/runs/:runId/events', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = getChatRun(runId);
    if (!run) return reply.code(404).send({ error: 'Run not found' });

    const query = request.query as { lastEventId?: string };
    const headerLastEventId = request.headers['last-event-id'];
    const lastEventId = Number(Array.isArray(headerLastEventId) ? headerLastEventId[0] : headerLastEventId ?? query.lastEventId ?? 0);
    const stream = openSse(reply);

    for (const runEvent of run.events) if (runEvent.id > lastEventId) stream.emit('event', runEvent.event, runEvent.id);

    if (run.status !== 'running') {
      stream.emit('done', snapshotRun(run));
      stream.close();
      return;
    }

    const onEvent = (event: unknown) => {
      const runEvent = event as { id: number; event: unknown };
      stream.emit('event', runEvent.event, runEvent.id);
    };
    const onDone = () => {
      stream.emit('done', snapshotRun(run));
      stream.close();
    };

    run.emitter.on('event', onEvent);
    run.emitter.once('done', onDone);
    request.raw.on('close', () => {
      run.emitter.off('event', onEvent);
      run.emitter.off('done', onDone);
      stream.close();
    });
  });
}
