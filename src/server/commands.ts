import { createSession, listEvents, listSessions, listSystemStatus, setChannelActiveSession } from './db.js';
import type { ChannelName, HarborEvent } from './types.js';

export type HarborCommandInput = {
  text: string;
  channel: ChannelName;
  sessionId: string;
  identity?: string;
};

export type HarborCommandResult = {
  events: HarborEvent[];
  text: string;
  sessionId?: string;
};

export async function handleHarborCommand(input: HarborCommandInput): Promise<HarborCommandResult | undefined> {
  const text = input.text.trim();
  if (!text.startsWith('/')) return undefined;
  const [commandWithSlash, ...args] = text.split(/\s+/);
  const command = commandWithSlash.toLowerCase();

  if (command === '/help') return textResult(helpText());
  if (command === '/status') return textResult(statusText());
  if (command === '/sessions') return textResult(sessionsText());
  if (command === '/new') {
    const name = args.join(' ').trim() || defaultSessionName(input.channel);
    const session = createSession(name);
    if (input.identity) setChannelActiveSession(input.channel, input.identity, session.id);
    return { ...textResult(`Created and switched to session:\n${session.name}\n${session.id}`), sessionId: session.id };
  }

  return undefined;
}

function defaultSessionName(channel: ChannelName): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `Session ${stamp}`;
}

function textResult(text: string): HarborCommandResult {
  return { text, events: [{ type: 'assistant_message', text }] };
}

function helpText(): string {
  return `Harbor commands\n\n/help — show this help\n/status — show Harbor system status\n/sessions — list active sessions\n/new [name] — create a new session`;
}

function statusText(): string {
  const systems = listSystemStatus();
  const errors = listEvents({ level: 'error', limit: 5 });
  const statusLines = systems.length
    ? systems.map((system) => `${system.key}: ${system.status} — ${system.summary}`)
    : ['No system status recorded yet.'];
  const errorLines = errors.length
    ? errors.map((event) => `- ${event.source}: ${event.title}${event.message ? ` — ${event.message}` : ''}`)
    : ['none'];
  return `Harbor status\n\n${statusLines.join('\n')}\n\nRecent errors:\n${errorLines.join('\n')}`;
}

function sessionsText(): string {
  const sessions = listSessions();
  if (sessions.length === 0) return 'No active sessions.';
  return `Active sessions\n\n${sessions.map((session, index) => `${index + 1}. ${session.name}\n   ${session.id}`).join('\n')}`;
}
