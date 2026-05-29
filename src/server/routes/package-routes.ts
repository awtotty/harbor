import type { FastifyInstance, FastifyReply } from 'fastify';
import type { EventSink } from '../types.js';
import { installBundle, listBundles, uninstallBundle } from '../bundles.js';
import { listPackages, runPiPackageCommand } from '../packages.js';
import { openSse } from '../sse.js';
import type { RouteContext } from './context.js';

export async function registerPackageRoutes(app: FastifyInstance, context: RouteContext) {
  app.get('/api/packages', async () => ({ packages: await listPackages() }));
  app.post('/api/packages/install', async (request, reply) => {
    const body = request.body as { source?: string };
    if (!body.source) return reply.code(400).send({ error: 'Missing source' });
    await streamPackageCommand(reply, ['install', body.source], context);
  });
  app.post('/api/packages/remove', async (request, reply) => {
    const body = request.body as { source?: string };
    if (!body.source) return reply.code(400).send({ error: 'Missing source' });
    await streamPackageCommand(reply, ['remove', body.source], context);
  });
  app.post('/api/packages/update', async (request, reply) => {
    const body = request.body as { source?: string };
    await streamPackageCommand(reply, body.source ? ['update', body.source] : ['update'], context);
  });
  app.get('/api/bundles', async () => ({ bundles: await listBundles() }));
  app.post('/api/bundles/install', async (request, reply) => {
    const body = request.body as { id?: string };
    if (!body.id) return reply.code(400).send({ error: 'Missing id' });
    await streamBundleCommand(reply, context, (sink) => installBundle(body.id!, sink));
  });
  app.post('/api/bundles/uninstall', async (request, reply) => {
    const body = request.body as { id?: string };
    if (!body.id) return reply.code(400).send({ error: 'Missing id' });
    await streamBundleCommand(reply, context, (sink) => uninstallBundle(body.id!, sink));
  });
}

async function streamBundleCommand(reply: FastifyReply, context: RouteContext, action: (sink: EventSink) => Promise<void>) {
  const stream = openSse(reply);
  try {
    await action((event) => stream.emit('event', event));
    context.router.resetSessions();
  } catch (error) {
    stream.emit('event', { type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    stream.emit('done', {});
    stream.close();
  }
}

async function streamPackageCommand(reply: FastifyReply, args: string[], context: RouteContext) {
  const stream = openSse(reply);
  try {
    await runPiPackageCommand(args, (event) => stream.emit('event', event));
    context.router.resetSessions();
  } catch (error) {
    stream.emit('event', { type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    stream.emit('done', {});
    stream.close();
  }
}
