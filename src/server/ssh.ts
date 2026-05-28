import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const sshDir = '/home/agent/.ssh';
const authorizedKeysPath = `${sshDir}/authorized_keys`;

export async function readAuthorizedKeys(): Promise<string> {
  await ensureSshDir();
  if (!existsSync(authorizedKeysPath)) return '';
  return readFile(authorizedKeysPath, 'utf8');
}

export async function writeAuthorizedKeys(keys: string): Promise<void> {
  await ensureSshDir();
  await writeFile(authorizedKeysPath, normalizeKeys(keys), { mode: 0o600 });
  await chmod(authorizedKeysPath, 0o600);
}

export function sshCommand(): string {
  return 'ssh agent@<host> -p 2222';
}

async function ensureSshDir(): Promise<void> {
  await mkdir(sshDir, { recursive: true, mode: 0o700 });
  await chmod(sshDir, 0o700);
}

function normalizeKeys(keys: string): string {
  return keys
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n') + '\n';
}
