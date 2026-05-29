import type { FastifyInstance } from 'fastify';
import { listEvents, listSystemStatus, recordEvent, setSystemStatus } from '../db.js';
import { currentVersion, getUpdateStatus, requestUpdate } from '../updates.js';

export async function registerObservabilityRoutes(app: FastifyInstance) {
  app.get('/api/observability/events', async (request) => {
    const query = request.query as { source?: string; level?: string; limit?: string };
    return { events: listEvents({ source: query.source, level: query.level, limit: query.limit ? Number(query.limit) : undefined }) };
  });

  app.get('/api/observability/status', async () => ({ systems: listSystemStatus() }));

  app.get('/api/updates/status', async () => getUpdateStatus());
  app.post('/api/updates/request', async (request, reply) => {
    const body = request.body as { target?: string };
    try {
      return await requestUpdate(body.target);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/healthz', async () => ({ ok: true, version: currentVersion() }));
}

export function recordStartupStatus() {
  const startedAt = new Date().toISOString();
  setSystemStatus({ key: 'server', status: 'ok', summary: 'Harbor server running', metadata: { startedAt } });
  recordEvent({ source: 'server', level: 'info', type: 'server.started', title: 'Harbor server started', metadata: { startedAt } });
}
