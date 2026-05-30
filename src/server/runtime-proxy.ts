import http from 'node:http';
import https from 'node:https';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { runtimeHeaders, runtimeUrl } from './runtime-config.js';

const STRIPPED_HEADERS = new Set(['host', 'content-length', 'connection']);

export async function registerRuntimeProxyRoutes(app: FastifyInstance, prefixes: string[]) {
  for (const prefix of prefixes) {
    app.all(prefix, (request, reply) => proxyRuntimeRequest(request, reply));
    app.all(`${prefix}/*`, (request, reply) => proxyRuntimeRequest(request, reply));
  }
}

export async function proxyRuntimeRequest(request: FastifyRequest, reply: FastifyReply, pathOverride?: string) {
  if (!runtimeUrl) return reply.code(503).send({ error: 'Runtime service is not configured' });
  const target = new URL(pathOverride ?? request.raw.url ?? '/', runtimeUrl);
  const client = target.protocol === 'https:' ? https : http;
  const headers: http.OutgoingHttpHeaders = { ...runtimeHeaders() };
  for (const [key, value] of Object.entries(request.headers)) {
    if (STRIPPED_HEADERS.has(key.toLowerCase()) || value === undefined) continue;
    headers[key] = value;
  }

  return new Promise<void>((resolve) => {
    const upstream = client.request(target, { method: request.method, headers }, (upstreamRes) => {
      reply.raw.statusCode = upstreamRes.statusCode ?? 502;
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined) reply.raw.setHeader(key, value);
      }
      reply.hijack();
      upstreamRes.pipe(reply.raw);
      upstreamRes.on('end', resolve);
    });
    upstream.on('error', (error) => {
      if (!reply.sent) reply.code(502).send({ error: `Runtime request failed: ${error.message}` });
      resolve();
    });
    writeBody(request, upstream);
  });
}

function writeBody(request: FastifyRequest, upstream: http.ClientRequest) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.body === undefined) {
    upstream.end();
    return;
  }
  if (Buffer.isBuffer(request.body) || typeof request.body === 'string') {
    upstream.end(request.body);
    return;
  }
  upstream.setHeader('content-type', 'application/json');
  upstream.end(JSON.stringify(request.body));
}
