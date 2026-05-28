import type { FastifyInstance } from 'fastify';
import { archiveSession, createSession, listMessages, listSessions, restoreSession } from '../db.js';

export async function registerSessionRoutes(app: FastifyInstance) {
  app.get('/api/sessions/:sessionId/messages', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    return { messages: listMessages(sessionId) };
  });

  app.get('/api/sessions', async (request) => {
    const query = request.query as { archived?: string };
    return { sessions: listSessions({ archived: query.archived === 'true' }) };
  });

  app.post('/api/sessions', async (request) => {
    const body = request.body as { name?: string };
    return { session: createSession(body.name) };
  });

  app.post('/api/sessions/:sessionId/archive', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    archiveSession(sessionId);
    return { ok: true, sessions: listSessions() };
  });

  app.post('/api/sessions/:sessionId/restore', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    restoreSession(sessionId);
    return { ok: true, sessions: listSessions() };
  });
}
