import { createSession, listEvents, listSessions, listSystemStatus, setChannelActiveSession } from './db.js';
import { getUpdateStatus, requestUpdate } from './updates.js';
import { formatProviderLoginRun, getProviderLoginRun, providerLoginHelp, startProviderLoginRun, submitProviderLoginInput } from './provider-login-runs.js';
import type { ChannelName, HarborEvent } from './types.js';

export type HarborCommandInput = {
  text: string;
  channel: ChannelName;
  sessionId: string;
  identity?: string;
  onProviderAuthChanged?: () => void;
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
  if (command === '/login') return textResult(await loginText(args, input.onProviderAuthChanged));
  if (command === '/update') return textResult(await updateText(args));
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
  return `Harbor commands\n\n/help — show this help\n/status — show Harbor system status\n/sessions — list active sessions\n/new [name] — create a new session\n/login — list model provider login options\n/login <provider-id> — start a provider login\n/login status <login-id> — check login progress\n/login input <login-id> <value> — submit a manual redirect URL/code\n/update — show update status\n/update confirm — back up and update to the latest tag`;
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

async function loginText(args: string[], onProviderAuthChanged?: () => void): Promise<string> {
  const subcommand = args[0]?.toLowerCase();
  if (!subcommand) return providerLoginHelp();

  if (subcommand === 'status') {
    const run = getProviderLoginRun(args[1]);
    if (!run) return 'Login run not found. Start a provider login with /login <provider-id>.';
    return formatProviderLoginRun(run);
  }

  if (subcommand === 'input') {
    const id = args[1];
    const value = args.slice(2).join(' ').trim();
    if (!id || !value) return 'Usage: /login input <login-id> <full localhost redirect URL or code>';
    const ok = submitProviderLoginInput(id, value);
    if (!ok) return 'Login input request not found. Check the login id and try /login status <login-id>.';
    return `Submitted login input for ${id}. Check progress with /login status ${id}.`;
  }

  const run = await startProviderLoginRun(subcommand, onProviderAuthChanged);
  if (!run) return `Unknown provider: ${subcommand}\n\n${await providerLoginHelp()}`;
  return formatProviderLoginRun(run);
}

async function updateText(args: string[]): Promise<string> {
  const updates = await getUpdateStatus();
  const lines = [
    'Harbor updates',
    '',
    `Current: ${updates.current.version} (${updates.current.commit})`,
    `Latest: ${updates.latest?.tag ?? 'unknown'}`,
    `Updater: ${updates.updaterConfigured ? updates.updater?.running ? 'running' : 'configured' : 'not configured'}`,
  ];
  if (updates.message) lines.push(`Note: ${updates.message}`);
  if (updates.updater?.lastRun?.error) lines.push(`Last updater error: ${updates.updater.lastRun.error}`);

  if (args[0]?.toLowerCase() !== 'confirm') {
    if (!updates.latest) return lines.join('\n');
    if (!updates.available) return [...lines, '', 'Harbor is already on the latest tag.'].join('\n');
    if (!updates.updaterConfigured) return [...lines, '', 'Update available, but the external updater is not configured. See docs/UPDATES.md.'].join('\n');
    if (updates.updater?.running) return [...lines, '', 'An update is already running.'].join('\n');
    return [...lines, '', `Update available. Run /update confirm to back up and update to ${updates.latest.tag}.`].join('\n');
  }

  if (!updates.latest) return [...lines, '', 'Cannot update because no latest tag was found.'].join('\n');
  if (!updates.available) return [...lines, '', 'Harbor is already on the latest tag.'].join('\n');
  if (!updates.updaterConfigured) return [...lines, '', 'Cannot update because the external updater is not configured. See docs/UPDATES.md.'].join('\n');
  if (updates.updater?.running) return [...lines, '', 'An update is already running.'].join('\n');

  await requestUpdate(updates.latest.tag);
  return [...lines, '', `Update requested for ${updates.latest.tag}. Harbor may disconnect during restart.`].join('\n');
}

function sessionsText(): string {
  const sessions = listSessions();
  if (sessions.length === 0) return 'No active sessions.';
  return `Active sessions\n\n${sessions.map((session, index) => `${index + 1}. ${session.name}\n   ${session.id}`).join('\n')}`;
}
