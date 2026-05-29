import { EventEmitter } from 'node:events';
import type { MessageRouter } from './router.js';
import { sendChatMessage } from './chat-service.js';
import { handleHarborCommand } from './commands.js';
import type { HarborEvent } from './types.js';

export type ChatRunStatus = 'running' | 'done' | 'error';

export type ChatRunEvent = {
  id: number;
  event: HarborEvent;
  createdAt: string;
};

type ChatRunRecord = {
  id: string;
  sessionId: string;
  status: ChatRunStatus;
  emitter: EventEmitter;
  events: ChatRunEvent[];
  nextEventId: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type ChatRunSnapshot = {
  id: string;
  sessionId: string;
  status: ChatRunStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  eventCount: number;
  error?: string;
};

const runs = new Map<string, ChatRunRecord>();
const RUN_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_EVENTS_PER_RUN = 500;

const cleanupTimer = setInterval(cleanupRuns, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

export function startChatRun(input: { router: MessageRouter; sessionId: string; message: string }): ChatRunRecord {
  cleanupRuns();
  const now = new Date();
  const run: ChatRunRecord = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    status: 'running',
    emitter: new EventEmitter(),
    events: [],
    nextEventId: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RUN_TTL_MS).toISOString(),
  };
  runs.set(run.id, run);
  void executeRun(run, input.router, input.message);
  return run;
}

export function getChatRun(id: string): ChatRunRecord | undefined {
  return runs.get(id);
}

export function getChatRunSnapshot(id: string): ChatRunSnapshot | undefined {
  const run = runs.get(id);
  return run ? snapshotRun(run) : undefined;
}

export function snapshotRun(run: ChatRunRecord): ChatRunSnapshot {
  return {
    id: run.id,
    sessionId: run.sessionId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    expiresAt: run.expiresAt,
    eventCount: run.events.length,
    error: run.error,
  };
}

function emitRun(run: ChatRunRecord, event: HarborEvent) {
  const now = new Date();
  const runEvent: ChatRunEvent = { id: run.nextEventId++, event, createdAt: now.toISOString() };
  run.updatedAt = runEvent.createdAt;
  run.events.push(runEvent);
  if (run.events.length > MAX_EVENTS_PER_RUN) run.events.splice(0, run.events.length - MAX_EVENTS_PER_RUN);
  run.emitter.emit('event', runEvent);
}

async function executeRun(run: ChatRunRecord, router: MessageRouter, message: string) {
  try {
    const command = await handleHarborCommand({ text: message, channel: 'web', sessionId: run.sessionId });
    if (command) {
      if (command.sessionId) run.sessionId = command.sessionId;
      for (const event of command.events) emitRun(run, event);
    } else {
      await sendChatMessage({ router, sessionId: run.sessionId, channel: 'web', senderId: 'local-web-user', text: message, sink: (event) => emitRun(run, event) });
    }
    run.status = 'done';
  } catch (error) {
    run.status = 'error';
    run.error = error instanceof Error ? error.message : String(error);
    emitRun(run, { type: 'error', message: run.error });
  } finally {
    const now = new Date();
    run.updatedAt = now.toISOString();
    run.expiresAt = new Date(now.getTime() + RUN_TTL_MS).toISOString();
    run.emitter.emit('done');
  }
}

function cleanupRuns() {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (run.status !== 'running' && Date.parse(run.expiresAt) < now) runs.delete(id);
  }
}
