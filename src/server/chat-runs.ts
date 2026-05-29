import { EventEmitter } from 'node:events';
import type { MessageRouter } from './router.js';
import { sendChatMessage } from './chat-service.js';
import { handleHarborCommand } from './commands.js';
import type { HarborEvent } from './types.js';

export type ChatRunStatus = 'running' | 'done' | 'error';

type ChatRunRecord = {
  id: string;
  sessionId: string;
  status: ChatRunStatus;
  emitter: EventEmitter;
  events: HarborEvent[];
  error?: string;
  createdAt: number;
};

const runs = new Map<string, ChatRunRecord>();
const RUN_TTL_MS = 10 * 60 * 1000;

export function startChatRun(input: { router: MessageRouter; sessionId: string; message: string }): ChatRunRecord {
  cleanupRuns();
  const run: ChatRunRecord = { id: crypto.randomUUID(), sessionId: input.sessionId, status: 'running', emitter: new EventEmitter(), events: [], createdAt: Date.now() };
  runs.set(run.id, run);
  void executeRun(run, input.router, input.message);
  return run;
}

export function getChatRun(id: string): ChatRunRecord | undefined {
  return runs.get(id);
}

function emitRun(run: ChatRunRecord, event: HarborEvent) {
  run.events.push(event);
  run.emitter.emit('event', event);
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
    run.emitter.emit('done');
  }
}

function cleanupRuns() {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [id, run] of runs) if (run.createdAt < cutoff && run.status !== 'running') runs.delete(id);
}
