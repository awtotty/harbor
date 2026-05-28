import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const configDir = process.env.HARBOR_CONFIG_DIR ?? '/config';
export const workspaceDir = process.env.HARBOR_WORKSPACE_DIR ?? '/workspace';
export const envPath = `${configDir}/harbor.env`;
export const piAgentDir = process.env.PI_CODING_AGENT_DIR ?? `${configDir}/pi-agent`;

export type EnvEntry = {
  key: string;
  value: string;
};

export async function ensureConfigDir(): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await mkdir(`${configDir}/sessions`, { recursive: true });
  await mkdir(piAgentDir, { recursive: true });
}

export async function readEnvEntries(): Promise<EnvEntry[]> {
  if (!existsSync(envPath)) return [];
  const raw = await readFile(envPath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      if (index === -1) return { key: line, value: '' };
      return { key: line.slice(0, index), value: line.slice(index + 1) };
    });
}

export async function writeEnvEntries(entries: EnvEntry[]): Promise<void> {
  await ensureConfigDir();
  const content = entries
    .filter((entry) => entry.key.trim())
    .map((entry) => `${entry.key.trim()}=${entry.value ?? ''}`)
    .join('\n');
  await writeFile(envPath, `${content}\n`, { mode: 0o600 });
}

export async function loadEnvFromFile(): Promise<Record<string, string>> {
  const entries = await readEnvEntries();
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}
