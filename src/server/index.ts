import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthSession, canAttemptLogin, isAuthed, isAuthedCookieRequest, recordLoginFailure, recordLoginSuccess, revokeAuthSession, revokeAuthToken, verifyPassword } from './auth.js';
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
import { registerDevProxy } from './dev-proxy.js';
import { startTelegramBot } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });
const port = Number(process.env.HARBOR_PORT ?? 8080);
const password = process.env.HARBOR_PASSWORD ?? 'harbor';
const router = new MessageRouter();
const routeContext = { router };

if (process.env.HARBOR_PRODUCTION === 'true' && password === 'harbor') {
  throw new Error('Refusing to start in production with default HARBOR_PASSWORD=harbor. Set HARBOR_PASSWORD in .env.');
}
if (password === 'harbor') {
  app.log.warn('Using default HARBOR_PASSWORD=harbor. Set HARBOR_PASSWORD before exposing Harbor beyond localhost.');
}

app.addHook('preHandler', async (request, reply) => {
  const pathname = request.url.split('?')[0];
  if (pathname === '/healthz' || pathname === '/api/login' || !pathname.startsWith('/api/')) return;
  if (!isRequestAuthed(request.headers.authorization, request.headers.cookie, headerValue(request.headers.referer), headerValue(request.headers.host))) return reply.code(401).send({ error: 'Unauthorized' });
});

app.post('/api/login', async (request, reply) => {
  const loginKey = request.ip;
  if (!canAttemptLogin(loginKey)) return reply.code(429).send({ error: 'Too many login attempts' });
  const body = request.body as { password?: string };
  if (!verifyPassword(body.password, password)) {
    recordLoginFailure(loginKey);
    return reply.code(401).send({ error: 'Invalid password' });
  }
  recordLoginSuccess(loginKey);
  const session = createAuthSession();
  reply.header('Set-Cookie', authCookie(session.token));
  return session;
});

app.get('/api/session', async () => ({ ok: true }));

app.post('/api/logout', async (request, reply) => {
  revokeAuthSession(request.headers.authorization);
  revokeAuthToken(readCookie(request.headers.cookie, 'harborToken'));
  reply.header('Set-Cookie', clearAuthCookie());
  return { ok: true };
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
await registerDevProxy(app);
recordStartupStatus();
startTelegramBot(router, app.log);

function isRequestAuthed(authorization: string | undefined, cookie: string | undefined, referer: string | undefined, host: string | undefined): boolean {
  return isAuthed(authorization) || isAuthedCookieRequest(cookie, referer, host);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function authCookie(token: string): string {
  return `harborToken=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearAuthCookie(): string {
  return 'harborToken=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const webRoot = join(__dirname, '../web');
app.register(fastifyStatic, { root: webRoot, wildcard: false });
app.setNotFoundHandler(async (_request, reply) => reply.sendFile('index.html'));

await app.listen({ host: '0.0.0.0', port });
