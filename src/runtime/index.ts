import Fastify from 'fastify';
import { ensureConfigDir } from '../server/config.js';
import { ensureDefaultPackages } from '../server/packages.js';
import { registerPackageRoutes } from '../server/routes/package-routes.js';
import { registerTerminalRoutes } from '../server/routes/terminal-routes.js';
import { MessageRouter } from '../server/router.js';
import { registerRuntimeDevProxy } from '../server/dev-proxy.js';
import type { HarborMessage } from '../server/types.js';

const app = Fastify({ logger: true });
const port = Number(process.env.HARBOR_RUNTIME_PORT ?? 8788);
const token = process.env.HARBOR_RUNTIME_TOKEN ?? '';
const router = new MessageRouter();
const routeContext = { router };

if (!token) throw new Error('HARBOR_RUNTIME_TOKEN is required');

app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/healthz') return;
  if (request.headers['x-harbor-runtime-token'] !== token) return reply.code(401).send({ error: 'Unauthorized' });
});

await ensureConfigDir();
try {
  await ensureDefaultPackages((event) => app.log.info({ event }, 'default package setup'));
} catch (error) {
  app.log.error({ error }, 'default package setup failed');
}

await registerTerminalRoutes(app);
await registerPackageRoutes(app, routeContext);
await registerRuntimeDevProxy(app);

app.post('/internal/message', async (request, reply) => {
  const message = request.body as HarborMessage;
  reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform' });
  try {
    await router.handle(message, (event) => reply.raw.write(`${JSON.stringify(event)}\n`));
  } catch (error) {
    reply.raw.write(`${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : String(error) })}\n`);
  } finally {
    reply.raw.end();
  }
});

app.get('/healthz', async () => ({ ok: true, role: 'runtime' }));

await app.listen({ host: '0.0.0.0', port });
