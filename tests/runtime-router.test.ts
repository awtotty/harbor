import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { HarborEvent } from '../src/server/types.js';

const token = 'test-runtime-token';
let mode: 'ok' | 'error' = 'ok';
let receivedToken: string | string[] | undefined;

const server = http.createServer((req, res) => {
  if (req.url !== '/internal/message') {
    res.writeHead(404).end();
    return;
  }
  receivedToken = req.headers['x-harbor-runtime-token'];
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  if (mode === 'error') res.end(`${JSON.stringify({ type: 'error', message: 'runtime failed' })}\n`);
  else res.end(`${JSON.stringify({ type: 'status', text: 'from runtime' })}\n`);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Failed to start test runtime server');

process.env.HARBOR_RUNTIME_URL = `http://127.0.0.1:${address.port}`;
process.env.HARBOR_RUNTIME_TOKEN = token;

const { MessageRouter } = await import('../src/server/router.js');

test.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('message router forwards prompts to configured runtime', async () => {
  mode = 'ok';
  const events: HarborEvent[] = [];
  await new MessageRouter().handle({ channel: 'web', senderId: 'test', workspaceId: 'default', sessionId: 's1', text: 'hello' }, (event) => events.push(event));
  assert.equal(receivedToken, token);
  assert.deepEqual(events, [{ type: 'status', text: 'from runtime' }]);
});

test('message router throws when runtime emits an error event', async () => {
  mode = 'error';
  const events: HarborEvent[] = [];
  await assert.rejects(
    () => new MessageRouter().handle({ channel: 'web', senderId: 'test', workspaceId: 'default', sessionId: 's1', text: 'hello' }, (event) => events.push(event)),
    /runtime failed/,
  );
  assert.deepEqual(events, [{ type: 'error', message: 'runtime failed' }]);
});
