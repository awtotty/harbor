import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthSession, isAuthed, isAuthedCookie, isAuthedCookieRequest, revokeAuthSession, verifyPassword } from '../src/server/auth.js';

test('login sessions use opaque bearer tokens, not the password', () => {
  const password = 'correct horse battery staple';
  const session = createAuthSession();

  assert.notEqual(session.token, password);
  assert.equal(isAuthed(`Bearer ${session.token}`), true);
  assert.equal(isAuthed(`Bearer ${password}`), false);
});

test('sessions can be authenticated with the HttpOnly cookie value', () => {
  const session = createAuthSession();

  const cookie = `other=value; harborToken=${encodeURIComponent(session.token)}`;

  assert.equal(isAuthedCookie(cookie), true);
  assert.equal(isAuthedCookie('other=value'), false);
  assert.equal(isAuthedCookieRequest(cookie, 'http://harbor.local/config', 'harbor.local'), true);
  assert.equal(isAuthedCookieRequest(cookie, 'http://harbor.local/proxy/5173/', 'harbor.local'), false);
  assert.equal(isAuthedCookieRequest(cookie, undefined, 'harbor.local'), false);
});

test('malformed Harbor auth cookies are treated as unauthenticated', () => {
  assert.doesNotThrow(() => isAuthedCookie('harborToken=%'));
  assert.equal(isAuthedCookie('harborToken=%'), false);
  assert.equal(isAuthedCookieRequest('harborToken=%', 'http://harbor.local/config', 'harbor.local'), false);
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
