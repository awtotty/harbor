import type { FastifyInstance } from 'fastify';
import { allowTelegramUser, getTelegramConfig, testTelegramToken, updateTelegramConfig } from '../telegram.js';

export async function registerTelegramRoutes(app: FastifyInstance) {
  app.get('/api/telegram', async () => getTelegramConfig());
  app.post('/api/telegram/test', async (request) => {
    const body = request.body as { botToken?: string };
    return testTelegramToken(body.botToken);
  });

  app.post('/api/telegram/allow-user', async (request, reply) => {
    const body = request.body as { userId?: string };
    if (!body.userId) return reply.code(400).send({ error: 'Missing userId' });
    return allowTelegramUser(body.userId);
  });

  app.post('/api/telegram', async (request) => {
    const body = request.body as { enabled?: boolean; botToken?: string; allowedUsers?: string[] | string };
    const allowedUsers = Array.isArray(body.allowedUsers) ? body.allowedUsers : (body.allowedUsers ?? '').split('\n');
    return updateTelegramConfig({ enabled: body.enabled, botToken: body.botToken, allowedUsers });
  });
}
