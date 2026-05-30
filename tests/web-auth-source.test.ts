import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web app does not persist or send browser-readable Harbor bearer tokens', async () => {
  const files = [
    'src/web/src/main.tsx',
    'src/web/src/lib/useSessions.ts',
    'src/web/src/components/chat/useChatMessages.ts',
    'src/web/src/components/Terminal.tsx',
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');

  assert.equal(source.includes("localStorage.setItem('harborToken'"), false);
  assert.equal(source.includes("localStorage.getItem('harborToken'"), false);
  assert.equal(source.includes('Authorization: `Bearer ${token}`'), false);
});
