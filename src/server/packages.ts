import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { piAgentDir, configDir, workspaceDir } from './config.js';
import { recordEvent, setSystemStatus } from './db.js';
import { loadEnvFromFile } from './config.js';
import type { EventSink } from './types.js';

export type PiPackage = {
  source: string;
  path?: string;
};

const piBin = '/app/node_modules/.bin/pi';

async function piEnv() {
  return {
    ...process.env,
    ...(await loadEnvFromFile()),
    PATH: `${configDir}/bin:${configDir}/tools/npm/bin:${process.env.PATH ?? ''}`,
    PI_CODING_AGENT_DIR: piAgentDir,
    PI_CODING_AGENT_SESSION_DIR: `${configDir}/sessions`,
  };
}

export async function runPiPackageCommand(args: string[], sink: EventSink): Promise<void> {
  const command = `pi ${args.join(' ')}`;
  recordEvent({ source: 'packages', level: 'info', type: 'package.command_started', title: 'Package command started', metadata: { command } });
  sink({ type: 'status', text: command });
  const child = spawn(piBin, args, { cwd: workspaceDir, env: await piEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data: Buffer) => sink({ type: 'tool_event', text: data.toString() }));
  child.stderr.on('data', (data: Buffer) => sink({ type: 'tool_event', text: data.toString() }));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) {
    const message = `${command} exited with code ${code}`;
    recordEvent({ source: 'packages', level: 'error', type: 'package.command_failed', title: 'Package command failed', message, metadata: { command, code } });
    setSystemStatus({ key: 'packages', status: 'error', summary: message, metadata: { command, code } });
    throw new Error(message);
  }
  recordEvent({ source: 'packages', level: 'info', type: 'package.command_completed', title: 'Package command completed', metadata: { command } });
  setSystemStatus({ key: 'packages', status: 'ok', summary: 'Last package command completed', metadata: { command } });
  sink({ type: 'done' });
}

export async function listPackages(): Promise<PiPackage[]> {
  const output = await capturePi(['list']);
  return parsePiList(output);
}

export async function ensureDefaultPackages(sink: EventSink): Promise<void> {
  const defaultPath = '/app/packages.default.json';
  if (!existsSync(defaultPath)) return;
  const config = JSON.parse(await readFile(defaultPath, 'utf8')) as { packages?: string[] };
  const installed = await listPackages();
  const installedSources = new Set(installed.map((pkg) => pkg.source));
  for (const source of config.packages ?? []) {
    if (installedSources.has(source)) continue;
    await runPiPackageCommand(['install', source], sink);
  }
}

async function capturePi(args: string[]): Promise<string> {
  const child = spawn(piBin, args, { cwd: workspaceDir, env: await piEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(output || `pi ${args.join(' ')} exited with code ${code}`);
  return output;
}

function parsePiList(output: string): PiPackage[] {
  const lines = output.split('\n');
  const packages: PiPackage[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('  ') || line.startsWith('    ')) continue;
    const source = line.trim();
    const next = lines[i + 1]?.trim();
    packages.push({ source, path: next?.startsWith('/') ? next : undefined });
  }
  return packages;
}
