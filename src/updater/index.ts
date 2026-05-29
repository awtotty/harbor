import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';

const port = Number(process.env.HARBOR_UPDATER_PORT ?? 8787);
const token = process.env.HARBOR_UPDATER_TOKEN ?? '';
const deployDir = process.env.HARBOR_DEPLOY_DIR ?? '/deploy';

type UpdaterState = {
  running: boolean;
  lastRun?: {
    status: 'success' | 'error';
    target?: string;
    startedAt: string;
    completedAt?: string;
    exitCode?: number | null;
    error?: string;
  };
  log: string[];
};

const state: UpdaterState = { running: false, log: [] };

if (!token) {
  console.error('HARBOR_UPDATER_TOKEN is required');
  process.exit(1);
}

createServer(async (request, response) => {
  try {
    if (!isAuthorized(request)) return json(response, 401, { error: 'Unauthorized' });
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/status') return json(response, 200, statusBody());
    if (request.method === 'POST' && url.pathname === '/update') return handleUpdate(request, response);
    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Harbor updater listening on ${port}`);
});

async function handleUpdate(request: IncomingMessage, response: ServerResponse) {
  if (state.running) return json(response, 409, { error: 'Update already running', ...statusBody() });
  const body = await readJson(request) as { target?: string; backup?: boolean };
  const target = body.target?.trim();
  if (target && !/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(target)) return json(response, 400, { error: 'Target must be a semver-like v* tag' });

  void runUpdate(target, body.backup !== false);
  return json(response, 202, { ok: true, ...statusBody() });
}

async function runUpdate(target: string | undefined, backup: boolean) {
  state.running = true;
  state.log = [];
  state.lastRun = { status: 'error', target, startedAt: new Date().toISOString() };
  const args = ['scripts/harbor-update.sh', '--yes'];
  if (target) args.push('--target', target);
  if (!backup) args.push('--no-backup');
  appendLog(`$ ${args.join(' ')}`);
  const child = spawn('bash', args, { cwd: deployDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk: Buffer) => appendLog(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => appendLog(chunk.toString()));
  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('error', (error) => {
      appendLog(`${error.message}\n`);
      resolve(1);
    });
    child.on('close', resolve);
  });
  state.running = false;
  state.lastRun = {
    ...state.lastRun,
    status: exitCode === 0 ? 'success' : 'error',
    completedAt: new Date().toISOString(),
    exitCode,
    error: exitCode === 0 ? undefined : `Updater exited with code ${exitCode}`,
  };
}

function statusBody() {
  return { configured: true, running: state.running, lastRun: state.lastRun, log: state.log.slice(-200) };
}

function appendLog(text: string) {
  for (const line of text.split(/(?<=\n)/)) {
    if (line) state.log.push(line);
  }
  if (state.log.length > 500) state.log = state.log.slice(-500);
}

function isAuthorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${token}`;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let data = '';
  for await (const chunk of request) data += chunk;
  return data ? JSON.parse(data) : {};
}

function json(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}
