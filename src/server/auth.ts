import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_LOGIN_ATTEMPTS = 10;

const sessionTtlMs = Number(process.env.HARBOR_SESSION_TTL_MS ?? DEFAULT_SESSION_TTL_MS);
const loginWindowMs = Number(process.env.HARBOR_LOGIN_WINDOW_MS ?? DEFAULT_LOGIN_WINDOW_MS);
const maxLoginAttempts = Number(process.env.HARBOR_MAX_LOGIN_ATTEMPTS ?? DEFAULT_MAX_LOGIN_ATTEMPTS);

type SessionRecord = {
  createdAt: number;
  expiresAt: number;
};

type LoginAttemptRecord = {
  count: number;
  resetAt: number;
};

const sessions = new Map<string, SessionRecord>();
const loginAttempts = new Map<string, LoginAttemptRecord>();

export function verifyPassword(candidate: string | undefined, expected: string): boolean {
  if (candidate === undefined) return false;
  return timingSafeEqual(hashBuffer(candidate), hashBuffer(expected));
}

export function createAuthSession(): { token: string; expiresAt: string } {
  cleanupExpiredSessions();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = now + sessionTtlMs;
  sessions.set(hash(token), { createdAt: now, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export function revokeAuthSession(authHeader: string | undefined): boolean {
  const token = bearerToken(authHeader);
  if (!token) return false;
  return sessions.delete(hash(token));
}

export function isAuthed(authHeader: string | undefined): boolean {
  const token = bearerToken(authHeader);
  if (!token) return false;
  const tokenHash = hash(token);
  const session = sessions.get(tokenHash);
  if (!session) return false;
  const now = Date.now();
  if (session.expiresAt <= now) {
    sessions.delete(tokenHash);
    return false;
  }
  session.expiresAt = now + sessionTtlMs;
  return true;
}

export function canAttemptLogin(key: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) return true;
  return record.count < maxLoginAttempts;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
    return;
  }
  current.count += 1;
}

export function recordLoginSuccess(key: string): void {
  loginAttempts.delete(key);
}

function bearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || undefined;
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function hash(value: string): string {
  return hashBuffer(value).toString('hex');
}

function hashBuffer(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
