import {
  createAgentSession,
  SessionManager as PiSessionManager,
} from '@earendil-works/pi-coding-agent';
import { loadEnvFromFile, configDir, workspaceDir, piAgentDir } from './config.js';
import { readHarborConfig } from './app-config.js';
import { createAuthStorage, createModelRegistry } from './pi-auth.js';
import type { EventSink } from './types.js';

type PiSessionRecord = {
  session: Awaited<ReturnType<typeof createAgentSession>>['session'];
  busy: boolean;
  sinks: Set<EventSink>;
};

export class PiSessionRegistry {
  private sessions = new Map<string, Promise<PiSessionRecord>>();

  clear(): void {
    for (const sessionPromise of this.sessions.values()) {
      void sessionPromise.then((record) => record.session.dispose()).catch(() => undefined);
    }
    this.sessions.clear();
  }

  async prompt(sessionId: string, text: string, sink: EventSink): Promise<void> {
    const record = await this.getOrCreate(sessionId, sink);
    if (record.busy) throw new Error(`Session ${sessionId} is already busy`);
    record.busy = true;
    record.sinks.add(sink);
    try {
      sink({ type: 'status', text: `Prompting pi session ${sessionId}` });
      await record.session.prompt(text);
      sink({ type: 'done' });
    } finally {
      record.sinks.delete(sink);
      record.busy = false;
    }
  }

  private getOrCreate(sessionId: string, sink: EventSink): Promise<PiSessionRecord> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const created = this.create(sessionId, sink);
    this.sessions.set(sessionId, created);
    return created;
  }

  private async create(sessionId: string, sink: EventSink): Promise<PiSessionRecord> {
    await applyConfigEnv();
    sink({ type: 'status', text: `Creating pi session ${sessionId}` });

    const authStorage = createAuthStorage();
    const modelRegistry = createModelRegistry(authStorage);
    const harborConfig = await readHarborConfig();
    const availableModels = modelRegistry.getAvailable();
    const configuredModel = harborConfig.selectedModel
      ? modelRegistry.find(harborConfig.selectedModel.provider, harborConfig.selectedModel.id)
      : undefined;
    const selected = configuredModel ?? availableModels[0];
    if (!selected) {
      throw new Error('No authenticated Pi models are available. Log in under Config → Auth / Providers, then select a model.');
    }
    sink({ type: 'status', text: `Using model ${selected.provider}/${selected.id}` });
    const { session } = await createAgentSession({
      agentDir: piAgentDir,
      cwd: workspaceDir,
      sessionManager: PiSessionManager.create(workspaceDir, `${configDir}/sessions`, { id: sessionId }),
      authStorage,
      modelRegistry,
      model: selected,
    });

    const sinks = new Set<EventSink>();
    session.subscribe((event: unknown) => {
      const text = extractText(event);
      if (!text) return;
      const harborEvent = text.kind === 'assistant' ? { type: 'assistant_delta' as const, text: text.text } : { type: 'tool_event' as const, text: text.text };
      for (const currentSink of sinks) currentSink(harborEvent);
    });

    return { session, busy: false, sinks };
  }
}

async function applyConfigEnv(): Promise<void> {
  const env = await loadEnvFromFile();
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  process.env.PI_CODING_AGENT_DIR = piAgentDir;
  process.env.PI_CODING_AGENT_SESSION_DIR = `${configDir}/sessions`;
}

function extractText(event: unknown): { kind: 'assistant' | 'tool'; text: string } | undefined {
  const e = event as Record<string, any>;
  if (e.type === 'message_update') {
    const assistantEvent = e.assistantMessageEvent;
    if (assistantEvent?.type === 'text_delta') return { kind: 'assistant', text: assistantEvent.delta ?? '' };
    if (assistantEvent?.type === 'error') return { kind: 'tool', text: `[error] ${assistantEvent.error?.message ?? assistantEvent.message ?? JSON.stringify(assistantEvent)}\n` };
    if (assistantEvent?.type && assistantEvent.type !== 'text_start' && assistantEvent.type !== 'text_end') return { kind: 'tool', text: formatEventPayload(assistantEvent) };
  }
  if (e.type === 'error') return { kind: 'tool', text: `[error] ${e.error?.message ?? e.message ?? JSON.stringify(e)}\n` };
  if (typeof e.type === 'string' && e.type.includes('tool')) return { kind: 'tool', text: formatEventPayload(e) };
  return undefined;
}

function formatEventPayload(event: Record<string, any>): string {
  const type = typeof event.type === 'string' ? event.type : 'event';
  const payload = redactLargePayload(event);
  return `[${type}]\n${JSON.stringify(payload, null, 2)}\n`;
}

function redactLargePayload(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[Max depth]';
  if (typeof value === 'string') return value.length > 5000 ? `${value.slice(0, 5000)}… [truncated ${value.length} chars]` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactLargePayload(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, redactLargePayload(child, depth + 1)]));
}
