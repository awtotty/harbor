import type { FastifyInstance } from 'fastify';
import { closeTerminal, createTerminal, getTerminalReplay, listTerminals, resizeTerminal, subscribeTerminal, writeTerminal } from '../terminals.js';

export async function registerTerminalRoutes(app: FastifyInstance) {
  app.get('/api/terminals', async () => ({ terminals: listTerminals() }));
  app.post('/api/terminals', async () => ({ terminal: createTerminal() }));
  app.post('/api/terminals/:terminalId/input', async (request, reply) => {
    const { terminalId } = request.params as { terminalId: string };
    const body = request.body as { input?: string };
    const ok = writeTerminal(terminalId, body.input ?? '');
    if (!ok) return reply.code(404).send({ error: 'Terminal not found or closed' });
    return { ok: true };
  });
  app.post('/api/terminals/:terminalId/resize', async (request, reply) => {
    const { terminalId } = request.params as { terminalId: string };
    const body = request.body as { cols?: number; rows?: number };
    const ok = resizeTerminal(terminalId, body.cols ?? 100, body.rows ?? 30);
    if (!ok) return reply.code(404).send({ error: 'Terminal not found or closed' });
    return { ok: true };
  });
  app.delete('/api/terminals/:terminalId', async (request) => {
    const { terminalId } = request.params as { terminalId: string };
    closeTerminal(terminalId);
    return { ok: true };
  });
  app.get('/api/terminals/:terminalId/stream', async (request, reply) => {
    const { terminalId } = request.params as { terminalId: string };
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    const replay = getTerminalReplay(terminalId);
    if (replay === undefined) {
      reply.raw.write(`event: error\n`);
      reply.raw.write(`data: ${JSON.stringify({ error: 'Terminal not found' })}\n\n`);
      reply.raw.end();
      return;
    }
    reply.raw.write(`event: replay\n`);
    reply.raw.write(`data: ${JSON.stringify({ chunk: replay })}\n\n`);
    const unsubscribe = subscribeTerminal(terminalId, (chunk) => {
      reply.raw.write(`event: chunk\n`);
      reply.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }, { replay: false });
    if (!unsubscribe) {
      reply.raw.write(`event: error\n`);
      reply.raw.write(`data: ${JSON.stringify({ error: 'Terminal not found' })}\n\n`);
      reply.raw.end();
      return;
    }
    request.raw.on('close', unsubscribe);
  });
}
