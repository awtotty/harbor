import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthSession, isAuthed, revokeAuthSession, verifyPassword } from '../src/server/auth.js';

test('login sessions use opaque bearer tokens, not the password', () => {
  const password = 'correct horse battery staple';
  const session = createAuthSession();

  assert.notEqual(session.token, password);
  assert.equal(isAuthed(`Bearer ${session.token}`), true);
  assert.equal(isAuthed(`Bearer ${password}`), false);
});

test('password verification and session revocation work', () => {
  assert.equal(verifyPassword('harbor', 'harbor'), true);
  assert.equal(verifyPassword('wrong', 'harbor'), false);
  assert.equal(verifyPassword(undefined, 'harbor'), false);

  const session = createAuthSession();
  assert.equal(isAuthed(`Bearer ${session.token}`), true);
  assert.equal(revokeAuthSession(`Bearer ${session.token}`), true);
  assert.equal(isAuthed(`Bearer ${session.token}`), false);
});
