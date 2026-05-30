import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import Fastify from 'fastify';
import { createAuthSession } from '../src/server/auth.js';
import { allowedDevProxyPorts, isCrossSiteProxyRequest, registerDevProxy } from '../src/server/dev-proxy.js';

test('default dev proxy allowlist includes common app ports and Vite default', () => {
  assert.equal(allowedDevProxyPorts().has(3000), true);
  assert.equal(allowedDevProxyPorts().has(3099), true);
  assert.equal(allowedDevProxyPorts().has(5173), true);
});

test('parses dev proxy allowed port ranges and lists', () => {
  assert.deepEqual([...allowedDevProxyPorts('3000-3002,5173')], [3000, 3001, 3002, 5173]);
});


test('dev proxy rejects obvious cross-site browser requests', () => {
  assert.equal(isCrossSiteProxyRequest({ host: 'harbor.local', 'sec-fetch-site': 'cross-site' }), true);
  assert.equal(isCrossSiteProxyRequest({ host: 'harbor.local', origin: 'https://evil.example' }), true);
  assert.equal(isCrossSiteProxyRequest({ host: 'harbor.local', origin: 'http://harbor.local' }), false);
  assert.equal(isCrossSiteProxyRequest({ host: 'harbor.local', 'sec-fetch-site': 'same-origin' }), false);
  assert.equal(isCrossSiteProxyRequest({ host: 'harbor.local' }), false);
});

test('ignores invalid dev proxy port entries', () => {
  assert.deepEqual([...allowedDevProxyPorts('0,abc,70000,3002-3000,8080')], [8080]);
});

test('dev proxy treats malformed auth cookies as unauthenticated', async () => {
  const previousPorts = process.env.HARBOR_DEV_PROXY_PORTS;
  process.env.HARBOR_DEV_PROXY_PORTS = '3124';
  const upstream = http.createServer((_req, res) => res.end('ok'));
  await new Promise<void>((resolve) => upstream.listen(3124, '127.0.0.1', resolve));

  const app = Fastify();
  await registerDevProxy(app);
  await app.ready();

  try {
    const res = await app.inject({ method: 'GET', url: '/proxy/3124/', headers: { cookie: 'harborToken=%' } });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    if (previousPorts === undefined) delete process.env.HARBOR_DEV_PROXY_PORTS;
    else process.env.HARBOR_DEV_PROXY_PORTS = previousPorts;
  }
});

test('dev proxy requires auth and strips Harbor credentials from upstream requests', async () => {
  const previousPorts = process.env.HARBOR_DEV_PROXY_PORTS;
  process.env.HARBOR_DEV_PROXY_PORTS = '3123';
  let upstreamHeaders: http.IncomingHttpHeaders = {};
  const upstream = http.createServer((req, res) => {
    upstreamHeaders = req.headers;
    res.setHeader('set-cookie', 'appSession=should-not-reach-browser');
    res.end(`${req.method} ${req.url}`);
  });
  await new Promise<void>((resolve) => upstream.listen(3123, '127.0.0.1', resolve));

  const app = Fastify();
  await registerDevProxy(app);
  await app.ready();

  try {
    const denied = await app.inject({ method: 'GET', url: '/proxy/3123/hello?x=1' });
    assert.equal(denied.statusCode, 401);

    const session = createAuthSession();
    const ok = await app.inject({
      method: 'GET',
      url: '/proxy/3123/hello?x=1',
      headers: {
        host: '127.0.0.1:8080',
        authorization: 'Bearer should-not-forward',
        cookie: `harborToken=${session.token}; other=value`,
        origin: 'http://127.0.0.1:8080',
        referer: 'http://127.0.0.1:8080/proxy/3123/hello',
      },
    });

    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body, 'GET /hello?x=1');
    assert.equal(upstreamHeaders.authorization, undefined);
    assert.equal(upstreamHeaders.cookie, undefined);
    assert.equal(upstreamHeaders.origin, undefined);
    assert.equal(upstreamHeaders.referer, undefined);
    assert.equal(ok.headers['set-cookie'], undefined);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    if (previousPorts === undefined) delete process.env.HARBOR_DEV_PROXY_PORTS;
    else process.env.HARBOR_DEV_PROXY_PORTS = previousPorts;
  }
});
