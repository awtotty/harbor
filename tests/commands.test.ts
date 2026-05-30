import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'harbor-commands-test-'));
process.env.HARBOR_CONFIG_DIR = join(root, 'config');
process.env.HARBOR_WORKSPACE_DIR = join(root, 'workspace');
process.env.PI_CODING_AGENT_DIR = join(root, 'config', 'pi-agent');

const { handleHarborCommand } = await import('../src/server/commands.js');

test('/login lists provider options', async () => {
  const result = await handleHarborCommand({ text: '/login', channel: 'web', sessionId: 'test' });

  assert.ok(result);
  assert.match(result.text, /Provider login/);
  assert.match(result.text, /\/login <provider-id>/);
  assert.match(result.text, /anthropic/);
});

test('/login returns useful messages for unknown or incomplete runs', async () => {
  const unknownProvider = await handleHarborCommand({ text: '/login not-a-provider', channel: 'web', sessionId: 'test' });
  assert.ok(unknownProvider);
  assert.match(unknownProvider.text, /Unknown provider: not-a-provider/);

  const missingStatus = await handleHarborCommand({ text: '/login status missing', channel: 'web', sessionId: 'test' });
  assert.ok(missingStatus);
  assert.match(missingStatus.text, /Login run not found/);

  const missingInput = await handleHarborCommand({ text: '/login input missing', channel: 'web', sessionId: 'test' });
  assert.ok(missingInput);
  assert.match(missingInput.text, /Usage: \/login input/);
});
