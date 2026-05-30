import { spawn } from 'node:child_process';
import { workspaceDir } from './config.js';
import { persistentToolEnv } from './tool-env.js';
import type { CapabilityBundle } from './bundles.js';
import type { EventSink } from './types.js';

export type BundleInstallerContext = {
  npmPrefix: string;
  npmBin: string;
  runCommand: (command: string, args: string[], sink: EventSink) => Promise<void>;
};

export type BundleInstaller = {
  install?: (bundle: CapabilityBundle, sink: EventSink, context: BundleInstallerContext) => Promise<void>;
  uninstall?: (bundle: CapabilityBundle, sink: EventSink, context: BundleInstallerContext) => Promise<void>;
};

export const bundleInstallers: Record<string, BundleInstaller> = {};

export async function runBundleCommand(command: string, args: string[], sink: EventSink, context: BundleInstallerContext): Promise<void> {
  const rendered = `${command} ${args.join(' ')}`;
  sink({ type: 'status', text: rendered });
  const child = spawn(command, args, { cwd: workspaceDir, env: persistentToolEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data: Buffer) => sink({ type: 'tool_event', text: data.toString() }));
  child.stderr.on('data', (data: Buffer) => sink({ type: 'tool_event', text: data.toString() }));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${rendered} exited with code ${code}`);
}
