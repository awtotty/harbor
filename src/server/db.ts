import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { configDir } from './config.js';
import type { ChannelName } from './types.js';

// node:sqlite is available in Node 22+ and keeps Harbor dependency-light.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - @types/node may lag the built-in module typing.
import { DatabaseSync } from 'node:sqlite';

export type StoredSession = {
  id: string;
  name: string;
  piSessionId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type StoredMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'event';
  kind?: 'status' | 'tool' | 'error' | null;
  channel: ChannelName;
  senderId?: string | null;
  text: string;
  createdAt: string;
};

const dbPath = `${configDir}/harbor.db`;
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

db.exec(`
  create table if not exists sessions (
    id text primary key,
    name text not null,
    pi_session_id text not null,
    workspace_id text not null,
    created_at text not null,
    updated_at text not null,
    archived_at text
  );
`);
try { db.exec('alter table sessions add column archived_at text'); } catch { /* existing column */ }
db.exec(`
  create table if not exists messages (
    id text primary key,
    session_id text not null,
    role text not null,
    kind text,
    channel text not null,
    sender_id text,
    text text not null,
    created_at text not null,
    foreign key (session_id) references sessions(id)
  );

  create index if not exists idx_messages_session_created on messages(session_id, created_at);
`);

export function listSessions(options: { archived?: boolean } = {}): StoredSession[] {
  ensureSession('default');
  const archived = options.archived === true;
  return db.prepare(`
    select id, name, pi_session_id as piSessionId, workspace_id as workspaceId, created_at as createdAt, updated_at as updatedAt, archived_at as archivedAt
    from sessions
    where ${archived ? 'archived_at is not null' : 'archived_at is null'}
    order by updated_at desc
  `).all() as StoredSession[];
}

export function archiveSession(id: string): void {
  if (id === 'default' && listSessions().length <= 1) createSession();
  db.prepare('update sessions set archived_at = ?, updated_at = ? where id = ?').run(new Date().toISOString(), new Date().toISOString(), id);
}

export function restoreSession(id: string): void {
  db.prepare('update sessions set archived_at = null, updated_at = ? where id = ?').run(new Date().toISOString(), id);
}

export function createSession(name?: string): StoredSession {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const finalName = name?.trim() || `Session ${now.slice(0, 16).replace('T', ' ')}`;
  db.prepare(`
    insert into sessions (id, name, pi_session_id, workspace_id, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?)
  `).run(id, finalName, id, 'default', now, now);
  return { id, name: finalName, piSessionId: id, workspaceId: 'default', createdAt: now, updatedAt: now };
}

export function touchSession(id: string): void {
  db.prepare('update sessions set updated_at = ? where id = ?').run(new Date().toISOString(), id);
}

export function ensureSession(id: string, workspaceId = 'default'): void {
  const now = new Date().toISOString();
  db.prepare(`
    insert into sessions (id, name, pi_session_id, workspace_id, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?)
    on conflict(id) do update set updated_at = excluded.updated_at
  `).run(id, id, id, workspaceId, now, now);
}

export function insertMessage(input: Omit<StoredMessage, 'createdAt'> & { createdAt?: string }): StoredMessage {
  ensureSession(input.sessionId);
  touchSession(input.sessionId);
  const message: StoredMessage = { ...input, createdAt: input.createdAt ?? new Date().toISOString() };
  db.prepare(`
    insert into messages (id, session_id, role, kind, channel, sender_id, text, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(message.id, message.sessionId, message.role, message.kind ?? null, message.channel, message.senderId ?? null, message.text, message.createdAt);
  return message;
}

export function appendMessageText(id: string, delta: string): void {
  db.prepare('update messages set text = text || ? where id = ?').run(delta, id);
}

export function listMessages(sessionId: string): StoredMessage[] {
  ensureSession(sessionId);
  const rows = db.prepare(`
    select id, session_id as sessionId, role, kind, channel, sender_id as senderId, text, created_at as createdAt
    from messages
    where session_id = ?
    order by created_at asc
  `).all(sessionId) as StoredMessage[];
  return rows;
}

export function clearMessages(sessionId: string): void {
  db.prepare('delete from messages where session_id = ?').run(sessionId);
}
