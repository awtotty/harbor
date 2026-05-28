import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { configDir, ensureConfigDir } from './config.js';

export type HarborConfig = {
  selectedModel?: {
    provider: string;
    id: string;
  };
};

const harborConfigPath = `${configDir}/harbor.json`;

export async function readHarborConfig(): Promise<HarborConfig> {
  await ensureConfigDir();
  if (!existsSync(harborConfigPath)) return {};
  return JSON.parse(await readFile(harborConfigPath, 'utf8')) as HarborConfig;
}

export async function writeHarborConfig(config: HarborConfig): Promise<void> {
  await ensureConfigDir();
  await writeFile(harborConfigPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
