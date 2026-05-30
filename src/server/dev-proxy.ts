import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isAuthToken } from './auth.js';
import { isRuntimeConfigured, runtimeHeaders, runtimeUrl } from './runtime-config.js';
import { proxyRuntimeRequest } from './runtime-proxy.js';

const DEFAULT_DEV_PROXY_PORTS = '3000-3099,5173';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const STRIPPED_REQUEST_HEADERS = new Set(['authorization', 'content-length', 'cookie', 'origin', 'referer']);
const STRIPPED_RESPONSE_HEADERS = new Set(['set-cookie']);

export function allowedDevProxyPorts(value = process.env.HARBOR_DEV_PROXY_PORTS ?? DEFAULT_DEV_PROXY_PORTS): Set<number> {
  const ports = new Set<number>();
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!validPort(start) || !validPort(end) || start > end) continue;
      for (let port = start; port <= end; port += 1) ports.add(port);
      continue;
    }
    const port = Number(trimmed);
    if (validPort(port)) ports.add(port);
  }
  return ports;
}

export async function registerDevProxy(app: FastifyInstance) {
  const allowedPorts = allowedDevProxyPorts();

  app.all('/proxy/:port/*', async (request, reply) => {
    if (isCrossSiteProxyRequest(request.headers)) {
      return reply.code(403).send({ error: 'Cross-site dev proxy requests are not allowed' });
    }
    if (!isAuthToken(readCookie(request.headers.cookie, 'harborToken'))) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const { port, path } = parseProxyRequest(request);
    if (!allowedPorts.has(port)) return reply.code(404).send({ error: 'Dev proxy port is not allowed' });
    if (isRuntimeConfigured()) return proxyRuntimeRequest(request, reply, `/internal/dev-proxy/${port}${path}`);
    return proxyHttpRequest(request, reply, port, path);
  });

  app.server.on('upgrade', (request, socket, head) => {
    const parsed = parseProxyUrl(request.url ?? '');
    if (!parsed || !allowedPorts.has(parsed.port)) {
      socket.destroy();
      return;
    }
    if (isCrossSiteProxyRequest(request.headers)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!isAuthToken(readCookie(request.headers.cookie, 'harborToken'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (isRuntimeConfigured()) return proxyRuntimeWebSocketUpgrade(request, socket, head, parsed.port, parsed.path);
    proxyWebSocketUpgrade(request, socket, head, parsed.port, parsed.path);
  });
}

export async function registerRuntimeDevProxy(app: FastifyInstance) {
  const allowedPorts = allowedDevProxyPorts();
  const runtimeToken = process.env.HARBOR_RUNTIME_TOKEN ?? '';
  app.all('/internal/dev-proxy/:port/*', async (request, reply) => {
    const { port, path } = parseInternalProxyRequest(request);
    if (!allowedPorts.has(port)) return reply.code(404).send({ error: 'Dev proxy port is not allowed' });
    return proxyHttpRequest(request, reply, port, path);
  });
  app.server.on('upgrade', (request, socket, head) => {
    const parsed = parseInternalProxyUrl(request.url ?? '');
    if (!parsed || !allowedPorts.has(parsed.port) || request.headers['x-harbor-runtime-token'] !== runtimeToken) {
      socket.destroy();
      return;
    }
    proxyWebSocketUpgrade(request, socket, head, parsed.port, parsed.path);
  });
}

function parseProxyRequest(request: FastifyRequest): { port: number; path: string } {
  const params = request.params as { port?: string; '*': string };
  const parsed = parseProxyUrl(request.raw.url ?? '');
  return {
    port: Number(params.port),
    path: parsed?.path ?? `/${params['*'] ?? ''}`,
  };
}

function parseInternalProxyRequest(request: FastifyRequest): { port: number; path: string } {
  const params = request.params as { port?: string; '*': string };
  const parsed = parseInternalProxyUrl(request.raw.url ?? '');
  return {
    port: Number(params.port),
    path: parsed?.path ?? `/${params['*'] ?? ''}`,
  };
}

function parseProxyUrl(url: string): { port: number; path: string } | undefined {
  const parsed = new URL(url, 'http://harbor.local');
  const match = parsed.pathname.match(/^\/proxy\/(\d+)(?:\/(.*))?$/);
  if (!match) return undefined;
  const port = Number(match[1]);
  const rest = match[2] ?? '';
  const path = `/${rest}${parsed.search}`;
  return { port, path };
}

function parseInternalProxyUrl(url: string): { port: number; path: string } | undefined {
  const parsed = new URL(url, 'http://harbor-runtime.local');
  const match = parsed.pathname.match(/^\/internal\/dev-proxy\/(\d+)(?:\/(.*))?$/);
  if (!match) return undefined;
  const port = Number(match[1]);
  const rest = match[2] ?? '';
  const path = `/${rest}${parsed.search}`;
  return { port, path };
}

async function proxyHttpRequest(request: FastifyRequest, reply: FastifyReply, port: number, path: string) {
  return new Promise<void>((resolve) => {
    const headers = forwardedHeaders(request.headers, port);
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port,
        method: request.method,
        path,
        headers,
      },
      (upstreamRes) => {
        reply.raw.statusCode = upstreamRes.statusCode ?? 502;
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          const header = key.toLowerCase();
          if (value === undefined || HOP_BY_HOP_HEADERS.has(header) || STRIPPED_RESPONSE_HEADERS.has(header)) continue;
          reply.raw.setHeader(key, value);
        }
        reply.hijack();
        upstreamRes.pipe(reply.raw);
        upstreamRes.on('end', resolve);
      },
    );

    upstream.on('error', () => {
      if (!reply.sent) reply.code(502).send({ error: `No dev server is responding on port ${port}` });
      resolve();
    });

    writeRequestBody(request, upstream);
  });
}

function proxyRuntimeWebSocketUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer, port: number, path: string) {
  if (!runtimeUrl) return socket.destroy();
  const target = new URL(runtimeUrl);
  const runtimePort = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  const upstream = net.connect(runtimePort, target.hostname, () => {
    const headers = forwardedUpgradeHeaders(request.headers, port);
    Object.assign(headers, runtimeHeaders());
    upstream.write(`${request.method ?? 'GET'} /internal/dev-proxy/${port}${path} HTTP/${request.httpVersion}\r\n`);
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${key}: ${item}\r\n`);
      } else if (value !== undefined) {
        upstream.write(`${key}: ${value}\r\n`);
      }
    }
    upstream.write('\r\n');
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
}

function proxyWebSocketUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer, port: number, path: string) {
  const upstream = net.connect(port, '127.0.0.1', () => {
    const headers = forwardedUpgradeHeaders(request.headers, port);
    upstream.write(`${request.method ?? 'GET'} ${path} HTTP/${request.httpVersion}\r\n`);
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${key}: ${item}\r\n`);
      } else if (value !== undefined) {
        upstream.write(`${key}: ${value}\r\n`);
      }
    }
    upstream.write('\r\n');
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
}

function forwardedHeaders(headers: FastifyRequest['headers'], port: number): http.OutgoingHttpHeaders {
  const next: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    const header = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(header) || STRIPPED_REQUEST_HEADERS.has(header)) continue;
    next[key] = value;
  }
  next.host = `127.0.0.1:${port}`;
  next['x-forwarded-host'] = headers.host;
  next['x-forwarded-proto'] = 'http';
  next['x-harbor-dev-proxy'] = '1';
  return next;
}

function forwardedUpgradeHeaders(headers: http.IncomingHttpHeaders, port: number): http.OutgoingHttpHeaders {
  const next = forwardedHeaders(headers, port);
  next.connection = headers.connection ?? 'Upgrade';
  next.upgrade = headers.upgrade ?? 'websocket';
  return next;
}

function writeRequestBody(request: FastifyRequest, upstream: http.ClientRequest) {
  const body = request.body;
  if (body === undefined || request.method === 'GET' || request.method === 'HEAD') {
    upstream.end();
    return;
  }
  if (Buffer.isBuffer(body) || typeof body === 'string') {
    upstream.end(body);
    return;
  }
  upstream.end(JSON.stringify(body));
}

export function isCrossSiteProxyRequest(headers: http.IncomingHttpHeaders): boolean {
  const fetchSite = headerValue(headers['sec-fetch-site'])?.toLowerCase();
  if (fetchSite === 'cross-site') return true;
  const origin = headerValue(headers.origin);
  const host = headerValue(headers.host);
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
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

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}
