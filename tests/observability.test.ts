import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'harbor-observability-test-'));
process.env.HARBOR_CONFIG_DIR = join(root, 'config');
process.env.HARBOR_WORKSPACE_DIR = join(root, 'workspace');

const db = await import('../src/server/db.js');

test('records and lists structured events newest first', () => {
  db.recordEvent({
    source: 'test',
    level: 'info',
    type: 'test.started',
    title: 'Test started',
    metadata: { ok: true },
  });
  db.recordEvent({
    source: 'test',
    level: 'error',
    type: 'test.failed',
    title: 'Test failed',
    message: 'boom',
  });

  const events = db.listEvents({ source: 'test', limit: 10 });
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Test failed');
  assert.equal(events[0].message, 'boom');
  assert.deepEqual(events[1].metadata, { ok: true });

  const errors = db.listEvents({ level: 'error', limit: 10 });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].type, 'test.failed');
});

test('upserts system status and tracks ok/error timestamps', () => {
  const ok = db.setSystemStatus({ key: 'telegram', status: 'ok', summary: 'Polling' });
  assert.equal(ok.status, 'ok');
  assert.ok(ok.lastOkAt);
  assert.equal(ok.lastErrorAt, null);

  const error = db.setSystemStatus({ key: 'telegram', status: 'error', summary: 'Token rejected', metadata: { code: 401 } });
  assert.equal(error.status, 'error');
  assert.ok(error.lastOkAt);
  assert.ok(error.lastErrorAt);

  const systems = db.listSystemStatus();
  assert.equal(systems.length, 1);
  assert.equal(systems[0].key, 'telegram');
  assert.equal(systems[0].summary, 'Token rejected');
  assert.deepEqual(systems[0].metadata, { code: 401 });
});
