import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureConfigDir } from './config.js';
import { MessageRouter } from './router.js';
import { ensureDefaultPackages } from './packages.js';
import { registerChatRoutes } from './routes/chat-routes.js';
import { registerConfigRoutes } from './routes/config-routes.js';
import { registerPackageRoutes } from './routes/package-routes.js';
import { registerProviderRoutes } from './routes/provider-routes.js';
import { registerSessionRoutes } from './routes/session-routes.js';
import { registerTerminalRoutes } from './routes/terminal-routes.js';
import { registerTelegramRoutes } from './routes/telegram-routes.js';
import { recordStartupStatus, registerObservabilityRoutes } from './routes/observability-routes.js';
import { startTelegramBot } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });
const port = Number(process.env.HARBOR_PORT ?? 8080);
const password = process.env.HARBOR_PASSWORD ?? 'harbor';
const router = new MessageRouter();
const routeContext = { router };

if (password === 'harbor') {
  app.log.warn('Using default HARBOR_PASSWORD=harbor. Set HARBOR_PASSWORD before exposing Harbor beyond localhost.');
}

function isAuthed(auth?: string): boolean {
  if (!auth?.startsWith('Bearer ')) return false;
  return auth.slice('Bearer '.length) === password;
}

app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/healthz' || request.url.startsWith('/api/login') || !request.url.startsWith('/api/')) return;
  if (!isAuthed(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' });
});

app.post('/api/login', async (request, reply) => {
  const body = request.body as { password?: string };
  if (body.password !== password) return reply.code(401).send({ error: 'Invalid password' });
  return { token: password };
});

await ensureConfigDir();
try {
  await ensureDefaultPackages((event) => app.log.info({ event }, 'default package setup'));
} catch (error) {
  app.log.error({ error }, 'default package setup failed');
}

await registerConfigRoutes(app);
await registerProviderRoutes(app, routeContext);
await registerPackageRoutes(app, routeContext);
await registerSessionRoutes(app);
await registerTerminalRoutes(app);
await registerTelegramRoutes(app);
await registerObservabilityRoutes(app);
await registerChatRoutes(app, routeContext);
recordStartupStatus();
startTelegramBot(router, app.log);

const webRoot = join(__dirname, '../web');
app.register(fastifyStatic, { root: webRoot, wildcard: false });
app.setNotFoundHandler(async (_request, reply) => reply.sendFile('index.html'));

await app.listen({ host: '0.0.0.0', port });
