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
  linkedChannels?: Array<{ channel: ChannelName; identity: string }>;
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

export type StoredEvent = {
  id: string;
  createdAt: string;
  source: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  type: string;
  title: string;
  message?: string | null;
  metadata?: unknown;
  sessionId?: string | null;
  correlationId?: string | null;
};

export type SystemStatus = {
  key: string;
  status: 'ok' | 'degraded' | 'error' | 'disabled';
  summary: string;
  updatedAt: string;
  lastOkAt?: string | null;
  lastErrorAt?: string | null;
  metadata?: unknown;
};

export type ChannelState = {
  channel: ChannelName;
  identity: string;
  activeSessionId: string;
  updatedAt: string;
};

const dbPath = `${configDir}/harbor.db`;
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('pragma journal_mode = WAL');
db.exec('pragma busy_timeout = 5000');

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

  create table if not exists events (
    id text primary key,
    created_at text not null,
    source text not null,
    level text not null,
    type text not null,
    title text not null,
    message text,
    metadata_json text,
    session_id text,
    correlation_id text
  );

  create index if not exists idx_events_created on events(created_at desc);
  create index if not exists idx_events_source_created on events(source, created_at desc);
  create index if not exists idx_events_level_created on events(level, created_at desc);

  create table if not exists system_status (
    key text primary key,
    status text not null,
    summary text not null,
    updated_at text not null,
    last_ok_at text,
    last_error_at text,
    metadata_json text
  );

  create table if not exists channel_state (
    channel text not null,
    identity text not null,
    active_session_id text not null,
    updated_at text not null,
    primary key (channel, identity),
    foreign key (active_session_id) references sessions(id)
  );
`);

export function listSessions(options: { archived?: boolean } = {}): StoredSession[] {
  ensureSession('default');
  const archived = options.archived === true;
  const sessions = db.prepare(`
    select id, name, pi_session_id as piSessionId, workspace_id as workspaceId, created_at as createdAt, updated_at as updatedAt, archived_at as archivedAt
    from sessions
    where ${archived ? 'archived_at is not null' : 'archived_at is null'}
    order by created_at desc, id desc
  `).all() as unknown as StoredSession[];
  const linked = db.prepare('select channel, identity from channel_state where active_session_id = ?');
  return sessions.map((session) => ({ ...session, linkedChannels: linked.all(session.id) as Array<{ channel: ChannelName; identity: string }> }));
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
    on conflict(id) do nothing
  `).run(id, defaultSessionName(id), id, workspaceId, now, now);
}

function defaultSessionName(id: string): string {
  return id === 'default' ? 'Session' : id;
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

type MessageCursor = { createdAt: string; id: string };

export function listMessages(sessionId: string, options: { before?: MessageCursor; limit?: number } = {}): StoredMessage[] {
  ensureSession(sessionId);
  const limit = Math.min(Math.max(options.limit ?? 80, 1), 500);
  return visibleConversationWindow(sessionId, options.before, limit).messages;
}

export function hasMessagesBefore(sessionId: string, before?: MessageCursor): boolean {
  ensureSession(sessionId);
  if (!before) return visibleConversationWindow(sessionId, undefined, 80).hasMore;
  const row = db.prepare(`
    select 1 as found
    from messages
    where session_id = ? and (created_at < ? or (created_at = ? and id < ?))
    limit 1
  `).get(sessionId, before.createdAt, before.createdAt, before.id) as { found: number } | undefined;
  return Boolean(row);
}

function visibleConversationWindow(sessionId: string, before: MessageCursor | undefined, limit: number): { messages: StoredMessage[]; hasMore: boolean } {
  const pageSize = 250;
  let offset = 0;
  let visibleItems = 0;
  let previousWasTool = false;
  const selected: StoredMessage[] = [];
  for (;;) {
    const rows = before
      ? db.prepare(`
        select id, session_id as sessionId, role, kind, channel, sender_id as senderId, text, created_at as createdAt
        from messages
        where session_id = ? and (created_at < ? or (created_at = ? and id < ?))
        order by created_at desc, id desc
        limit ? offset ?
      `).all(sessionId, before.createdAt, before.createdAt, before.id, pageSize, offset) as StoredMessage[]
      : db.prepare(`
        select id, session_id as sessionId, role, kind, channel, sender_id as senderId, text, created_at as createdAt
        from messages
        where session_id = ?
        order by created_at desc, id desc
        limit ? offset ?
      `).all(sessionId, pageSize, offset) as StoredMessage[];
    if (rows.length === 0) return { messages: selected.reverse(), hasMore: false };
    for (const row of rows) {
      if (row.role === 'event' && row.kind === 'status') continue;
      const isTool = row.role === 'event' && row.kind === 'tool';
      const startsVisibleItem = !isTool || !previousWasTool;
      if (startsVisibleItem) {
        if (visibleItems >= limit) return { messages: selected.reverse(), hasMore: true };
        visibleItems += 1;
      }
      selected.push(row);
      previousWasTool = isTool;
    }
    offset += rows.length;
  }
}

export function clearMessages(sessionId: string): void {
  db.prepare('delete from messages where session_id = ?').run(sessionId);
}

export function recordEvent(input: Omit<StoredEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): StoredEvent {
  const event: StoredEvent = { id: input.id ?? crypto.randomUUID(), createdAt: input.createdAt ?? new Date().toISOString(), ...input };
  db.prepare(`
    insert into events (id, created_at, source, level, type, title, message, metadata_json, session_id, correlation_id)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, event.createdAt, event.source, event.level, event.type, event.title, event.message ?? null, event.metadata === undefined ? null : JSON.stringify(event.metadata), event.sessionId ?? null, event.correlationId ?? null);
  return event;
}

export function listEvents(filters: { source?: string; level?: string; limit?: number } = {}): StoredEvent[] {
  const clauses: string[] = [];
  const params: Array<string | number | null> = [];
  if (filters.source) { clauses.push('source = ?'); params.push(filters.source); }
  if (filters.level) { clauses.push('level = ?'); params.push(filters.level); }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = db.prepare(`
    select id, created_at as createdAt, source, level, type, title, message, metadata_json as metadataJson, session_id as sessionId, correlation_id as correlationId
    from events
    ${where}
    order by created_at desc
    limit ${limit}
  `).all(...params) as Array<Omit<StoredEvent, 'metadata'> & { metadataJson?: string | null }>;
  return rows.map(({ metadataJson, ...row }) => ({ ...row, metadata: metadataJson ? JSON.parse(metadataJson) : undefined })) as StoredEvent[];
}

export function setSystemStatus(input: Omit<SystemStatus, 'updatedAt'>): SystemStatus {
  const now = new Date().toISOString();
  const existing = db.prepare('select last_ok_at as lastOkAt, last_error_at as lastErrorAt from system_status where key = ?').get(input.key) as { lastOkAt?: string | null; lastErrorAt?: string | null } | undefined;
  const status: SystemStatus = {
    ...input,
    updatedAt: now,
    lastOkAt: input.status === 'ok' ? now : input.lastOkAt ?? existing?.lastOkAt ?? null,
    lastErrorAt: input.status === 'error' ? now : input.lastErrorAt ?? existing?.lastErrorAt ?? null,
  };
  db.prepare(`
    insert into system_status (key, status, summary, updated_at, last_ok_at, last_error_at, metadata_json)
    values (?, ?, ?, ?, ?, ?, ?)
    on conflict(key) do update set status = excluded.status, summary = excluded.summary, updated_at = excluded.updated_at, last_ok_at = excluded.last_ok_at, last_error_at = excluded.last_error_at, metadata_json = excluded.metadata_json
  `).run(status.key, status.status, status.summary, status.updatedAt, status.lastOkAt ?? null, status.lastErrorAt ?? null, status.metadata === undefined ? null : JSON.stringify(status.metadata));
  return status;
}

export function setChannelActiveSession(channel: ChannelName, identity: string, sessionId: string): ChannelState {
  ensureSession(sessionId);
  const now = new Date().toISOString();
  db.prepare(`
    insert into channel_state (channel, identity, active_session_id, updated_at)
    values (?, ?, ?, ?)
    on conflict(channel, identity) do update set active_session_id = excluded.active_session_id, updated_at = excluded.updated_at
  `).run(channel, identity, sessionId, now);
  return { channel, identity, activeSessionId: sessionId, updatedAt: now };
}

export function getChannelActiveSession(channel: ChannelName, identity: string): string | undefined {
  const row = db.prepare(`
    select cs.active_session_id as activeSessionId
    from channel_state cs
    join sessions s on s.id = cs.active_session_id
    where cs.channel = ? and cs.identity = ? and s.archived_at is null
  `).get(channel, identity) as { activeSessionId?: string } | undefined;
  return row?.activeSessionId;
}

export function listSystemStatus(): SystemStatus[] {
  const rows = db.prepare(`
    select key, status, summary, updated_at as updatedAt, last_ok_at as lastOkAt, last_error_at as lastErrorAt, metadata_json as metadataJson
    from system_status
    order by key asc
  `).all() as Array<Omit<SystemStatus, 'metadata'> & { metadataJson?: string | null }>;
  return rows.map(({ metadataJson, ...row }) => ({ ...row, metadata: metadataJson ? JSON.parse(metadataJson) : undefined })) as SystemStatus[];
}
