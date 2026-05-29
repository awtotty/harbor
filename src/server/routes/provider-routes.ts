import type { FastifyInstance } from 'fastify';
import { getModelOptions, getProviderStatuses, loginProvider, logoutProvider, selectModel, submitManualLoginInput } from '../pi-auth.js';
import { openSse } from '../sse.js';
import type { RouteContext } from './context.js';

export async function registerProviderRoutes(app: FastifyInstance, context: RouteContext) {
  app.get('/api/providers', async () => ({ providers: await getProviderStatuses() }));

  app.post('/api/providers/:providerId/logout', async (request) => {
    const { providerId } = request.params as { providerId: string };
    await logoutProvider(providerId);
    context.router.resetSessions();
    return { ok: true };
  });

  app.post('/api/providers/:providerId/login', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const loginId = crypto.randomUUID();
    const stream = openSse(reply);
    try {
      await loginProvider(providerId, (event) => stream.emit('event', event), loginId);
      context.router.resetSessions();
    } catch (error) {
      stream.emit('event', { type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      stream.emit('done', {});
      stream.close();
    }
  });

  app.post('/api/login-input/:loginId', async (request, reply) => {
    const { loginId } = request.params as { loginId: string };
    const body = request.body as { value?: string };
    if (!body.value) return reply.code(400).send({ error: 'Missing value' });
    const ok = submitManualLoginInput(loginId, body.value);
    if (!ok) return reply.code(404).send({ error: 'Login input request not found' });
    return { ok: true };
  });

  app.get('/api/models', async () => getModelOptions());
  app.post('/api/models/select', async (request) => {
    const body = request.body as { provider?: string; id?: string };
    if (!body.provider || !body.id) throw new Error('provider and id are required');
    await selectModel(body.provider, body.id);
    context.router.resetSessions();
    return { ok: true };
  });
}
