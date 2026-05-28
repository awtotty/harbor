import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { configDir, ensureConfigDir } from './config.js';

export type TelegramConfig = {
  enabled?: boolean;
  botToken?: string;
  allowedUsers?: string[];
  offset?: number;
  recentSenders?: Array<{ id: string; name: string; lastSeenAt: string }>;
  botInfo?: { id: string; username?: string; firstName?: string };
};

export type HarborConfig = {
  selectedModel?: {
    provider: string;
    id: string;
  };
  telegram?: TelegramConfig;
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
