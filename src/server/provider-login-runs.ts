import { cancelManualLoginInput, getProviderStatuses, loginProvider, submitManualLoginInput } from './pi-auth.js';
import type { HarborEvent } from './types.js';

const LOGIN_RUN_TTL_MS = 30 * 60 * 1000;

type ProviderLoginRun = {
  id: string;
  providerId: string;
  events: HarborEvent[];
  status: 'running' | 'done' | 'error';
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

const runs = new Map<string, ProviderLoginRun>();

export async function providerLoginHelp(): Promise<string> {
  const providers = await getProviderStatuses();
  const lines = providers.map((provider) => {
    const status = provider.auth.configured ? 'connected' : 'not connected';
    return `- ${provider.id} — ${provider.name} (${status})`;
  });
  return [
    'Provider login',
    '',
    'Start a provider login from chat or Telegram:',
    '/login <provider-id>',
    '',
    'Providers:',
    ...lines,
    '',
    'After starting a login, follow the URL/device-code instructions. If the provider asks you to paste a localhost redirect URL, use:',
    '/login input <login-id> <value>',
    '',
    'Check progress with:',
    '/login status <login-id>',
  ].join('\n');
}

export async function startProviderLoginRun(providerId: string, onDone?: () => void): Promise<ProviderLoginRun | undefined> {
  cleanupRuns();
  const providers = await getProviderStatuses();
  if (!providers.some((provider) => provider.id === providerId)) return undefined;

  const now = new Date();
  const run: ProviderLoginRun = {
    id: crypto.randomUUID(),
    providerId,
    events: [],
    status: 'running',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOGIN_RUN_TTL_MS).toISOString(),
  };
  runs.set(run.id, run);

  void loginProvider(providerId, (event) => pushEvent(run, event), run.id)
    .then(() => {
      run.status = 'done';
      touch(run);
      onDone?.();
    })
    .catch((error) => {
      run.status = 'error';
      run.error = error instanceof Error ? error.message : String(error);
      pushEvent(run, { type: 'error', message: run.error });
    });

  await waitForFirstUsefulEvent(run);
  return run;
}

export function getProviderLoginRun(id: string | undefined): ProviderLoginRun | undefined {
  cleanupRuns();
  if (!id) return undefined;
  return runs.get(id);
}

export function submitProviderLoginInput(id: string | undefined, value: string | undefined): boolean {
  if (!id || !value) return false;
  return submitManualLoginInput(id, value);
}

export function formatProviderLoginRun(run: ProviderLoginRun): string {
  const lines = [
    `Provider login: ${run.providerId}`,
    `Login id: ${run.id}`,
    `Status: ${run.status}`,
    '',
    ...run.events.map(formatEvent).filter(Boolean),
  ];
  if (run.status === 'running') {
    lines.push('', `Check progress: /login status ${run.id}`);
    lines.push(`Submit manual redirect/code: /login input ${run.id} <value>`);
  }
  return lines.join('\n').trim();
}

function pushEvent(run: ProviderLoginRun, event: HarborEvent): void {
  run.events.push(event);
  touch(run);
}

function touch(run: ProviderLoginRun): void {
  const now = new Date();
  run.updatedAt = now.toISOString();
  run.expiresAt = new Date(now.getTime() + LOGIN_RUN_TTL_MS).toISOString();
}

function waitForFirstUsefulEvent(run: ProviderLoginRun): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (run.status !== 'running' || run.events.some(isUsefulEvent) || Date.now() - startedAt > 1500) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

function isUsefulEvent(event: HarborEvent): boolean {
  return event.type === 'auth' || event.type === 'auth_device' || event.type === 'auth_manual_request' || event.type === 'error' || event.type === 'done';
}

function formatEvent(event: HarborEvent): string {
  if (event.type === 'status') return event.text;
  if (event.type === 'auth') return ['Open this URL to log in:', event.url, event.instructions].filter(Boolean).join('\n');
  if (event.type === 'auth_device') return [`Open: ${event.verificationUri}`, `Code: ${event.userCode}`, event.expiresInSeconds ? `Expires in: ${event.expiresInSeconds}s` : undefined].filter(Boolean).join('\n');
  if (event.type === 'auth_manual_request') return `${event.prompt}\n/login input ${event.loginId} <full localhost redirect URL or code>`;
  if (event.type === 'error') return `Error: ${event.message}`;
  if (event.type === 'done') return 'Done.';
  return '';
}

function cleanupRuns(): void {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (new Date(run.expiresAt).getTime() > now) continue;
    if (run.status === 'running') {
      run.status = 'error';
      run.error = 'Login run expired.';
      cancelManualLoginInput(id, run.error);
      pushEvent(run, { type: 'error', message: run.error });
    }
    runs.delete(id);
  }
}
