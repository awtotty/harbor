import os from 'node:os';
import { execFileSync } from 'node:child_process';
import pty, { type IPty, type IPtyForkOptions } from 'node-pty';
import { workspaceDir } from './config.js';
import { recordEvent, setSystemStatus } from './db.js';

export type TerminalInfo = { id: string; name: string; createdAt: string; alive: boolean };
type Terminal = TerminalInfo & { pty: IPty; listeners: Set<(chunk: string) => void>; buffer: string[] };

const terminals = new Map<string, Terminal>();
const terminalUser = process.env.HARBOR_TERMINAL_USER ?? 'agent';

function terminalUserOptions(): Pick<IPtyForkOptions, 'uid' | 'gid' | 'env'> {
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    USER: terminalUser,
    LOGNAME: terminalUser,
    HOME: `/home/${terminalUser}`,
  };
  if (process.platform === 'win32' || process.getuid?.() !== 0) return { env };
  try {
    return {
      uid: Number(execFileSync('id', ['-u', terminalUser], { encoding: 'utf8' }).trim()),
      gid: Number(execFileSync('id', ['-g', terminalUser], { encoding: 'utf8' }).trim()),
      env,
    };
  } catch {
    return { env: { ...process.env, TERM: 'xterm-256color' } };
  }
}

export function listTerminals(): TerminalInfo[] {
  return [...terminals.values()].map(({ id, name, createdAt, alive }) => ({ id, name, createdAt, alive }));
}

export function createTerminal(): TerminalInfo {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const name = `Terminal ${terminals.size + 1}`;
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const proc = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: workspaceDir,
    ...terminalUserOptions(),
  });
  const terminal: Terminal = { id, name, createdAt, alive: true, pty: proc, listeners: new Set(), buffer: [] };
  proc.onData((chunk) => {
    terminal.buffer.push(chunk);
    const joined = terminal.buffer.join('');
    if (joined.length > 120_000) terminal.buffer = [joined.slice(-90_000)];
    for (const listener of terminal.listeners) listener(chunk);
  });
  proc.onExit(({ exitCode }) => {
    terminal.alive = false;
    const chunk = `\r\n[terminal exited: ${exitCode}]\r\n`;
    terminal.buffer.push(chunk);
    for (const listener of terminal.listeners) listener(chunk);
  });
  proc.write('cd /workspace\r');
  terminals.set(id, terminal);
  recordEvent({ source: 'terminal', level: 'info', type: 'terminal.created', title: 'Terminal created', metadata: { terminalId: id, user: terminalUser } });
  setSystemStatus({ key: 'terminals', status: 'ok', summary: `${terminals.size} terminal(s) tracked`, metadata: { count: terminals.size } });
  return { id, name, createdAt, alive: true };
}

export function writeTerminal(id: string, input: string): boolean {
  const terminal = terminals.get(id);
  if (!terminal || !terminal.alive) return false;
  terminal.pty.write(input);
  return true;
}

export function resizeTerminal(id: string, cols: number, rows: number): boolean {
  const terminal = terminals.get(id);
  if (!terminal || !terminal.alive) return false;
  terminal.pty.resize(Math.max(10, cols), Math.max(5, rows));
  return true;
}

export function closeTerminal(id: string): boolean {
  const terminal = terminals.get(id);
  if (!terminal) return false;
  terminal.pty.kill();
  terminals.delete(id);
  recordEvent({ source: 'terminal', level: 'info', type: 'terminal.closed', title: 'Terminal closed', metadata: { terminalId: id } });
  setSystemStatus({ key: 'terminals', status: 'ok', summary: `${terminals.size} terminal(s) tracked`, metadata: { count: terminals.size } });
  return true;
}

export function getTerminalReplay(id: string): string | undefined {
  return terminals.get(id)?.buffer.join('');
}

export function subscribeTerminal(id: string, listener: (chunk: string) => void, options: { replay?: boolean } = { replay: true }): (() => void) | undefined {
  const terminal = terminals.get(id);
  if (!terminal) return undefined;
  if (options.replay !== false) listener(terminal.buffer.join(''));
  terminal.listeners.add(listener);
  return () => terminal.listeners.delete(listener);
}
