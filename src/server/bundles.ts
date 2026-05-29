import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, rm } from 'node:fs/promises';
import { configDir, readEnvEntries, writeEnvEntries } from './config.js';
import { runPiPackageCommand } from './packages.js';
import { recordEvent, setSystemStatus } from './db.js';
import type { EventSink } from './types.js';
import { bundleInstallers, runBundleCommand, type BundleInstallerContext } from './bundle-installers.js';

export type CapabilityBundle = {
  id: string;
  name: string;
  description?: string;
  installer?: string;
  npmGlobals?: string[];
  piPackages?: string[];
  dirs?: string[];
  env?: Record<string, string>;
  checkCommands?: string[];
  setup?: string[];
};

export type BundleStatus = CapabilityBundle & { installed: boolean };

const bundlesPath = '/app/bundles.default.json';
const npmPrefix = `${configDir}/tools/npm`;
const npmBin = `${npmPrefix}/bin`;
const installerContext: BundleInstallerContext = { npmPrefix, npmBin, runCommand: (command, args, sink) => runBundleCommand(command, args, sink, installerContext) };

export async function listBundles(): Promise<BundleStatus[]> {
  const bundles = await readBundles();
  return bundles.map((bundle) => ({ ...bundle, installed: isBundleInstalled(bundle) }));
}

export async function uninstallBundle(id: string, sink: EventSink): Promise<void> {
  const bundle = await getBundle(id);
  recordEvent({ source: 'bundles', level: 'info', type: 'bundle.uninstall_started', title: 'Bundle uninstall started', metadata: { id } });
  sink({ type: 'status', text: `Uninstalling ${bundle.name}` });

  const installer = getBundleInstaller(bundle);
  await installer?.uninstall?.(bundle, sink, installerContext);
  if (bundle.npmGlobals?.length) await runBundleCommand('npm', ['uninstall', '--global', '--prefix', npmPrefix, ...bundle.npmGlobals], sink, installerContext);
  for (const command of bundle.checkCommands ?? []) await rm(`${configDir}/bin/${command}`, { force: true });
  await removeBundleEnv(Object.keys(bundle.env ?? {}));

  recordEvent({ source: 'bundles', level: 'info', type: 'bundle.uninstall_completed', title: 'Bundle uninstall completed', metadata: { id } });
  setSystemStatus({ key: 'bundles', status: 'ok', summary: `Uninstalled ${bundle.name}`, metadata: { id } });
  sink({ type: 'done' });
}

export async function installBundle(id: string, sink: EventSink): Promise<void> {
  const bundle = await getBundle(id);
  recordEvent({ source: 'bundles', level: 'info', type: 'bundle.install_started', title: 'Bundle install started', metadata: { id } });
  sink({ type: 'status', text: `Installing ${bundle.name}` });

  for (const dir of bundle.dirs ?? []) await mkdir(dir, { recursive: true });
  await mergeBundleEnv(bundle.env ?? {});

  if (bundle.npmGlobals?.length) {
    await mkdir(npmPrefix, { recursive: true });
    await runBundleCommand('npm', ['install', '--global', '--prefix', npmPrefix, ...bundle.npmGlobals], sink, installerContext);
    await mkdir(`${configDir}/bin`, { recursive: true });
    for (const command of bundle.checkCommands ?? []) await linkCommand(command);
  }

  const installer = getBundleInstaller(bundle);
  await installer?.install?.(bundle, sink, installerContext);
  for (const source of bundle.piPackages ?? []) await runPiPackageCommand(['install', source], sink);

  recordEvent({ source: 'bundles', level: 'info', type: 'bundle.install_completed', title: 'Bundle install completed', metadata: { id } });
  setSystemStatus({ key: 'bundles', status: 'ok', summary: `Installed ${bundle.name}`, metadata: { id } });
  sink({ type: 'done' });
}

async function getBundle(id: string): Promise<CapabilityBundle> {
  const bundle = (await readBundles()).find((candidate) => candidate.id === id);
  if (!bundle) throw new Error(`Unknown bundle: ${id}`);
  return bundle;
}

async function readBundles(): Promise<CapabilityBundle[]> {
  if (!existsSync(bundlesPath)) return [];
  const config = JSON.parse(await readFile(bundlesPath, 'utf8')) as { bundles?: CapabilityBundle[] };
  return Array.isArray(config.bundles) ? config.bundles : [];
}

function isBundleInstalled(bundle: CapabilityBundle): boolean {
  const commands = bundle.checkCommands ?? [];
  if (commands.length > 0) return commands.every((command) => existsSync(`${configDir}/bin/${command}`) || existsSync(`${npmBin}/${command}`));
  if (bundle.npmGlobals?.length) return bundle.npmGlobals.every((pkg) => existsSync(`${npmPrefix}/lib/node_modules/${pkgName(pkg)}`));
  if (bundle.dirs?.length) return bundle.dirs.every((dir) => existsSync(dir));
  return false;
}

function getBundleInstaller(bundle: CapabilityBundle) {
  if (!bundle.installer) return undefined;
  const installer = bundleInstallers[bundle.installer];
  if (!installer) throw new Error(`Bundle ${bundle.id} references unknown installer: ${bundle.installer}`);
  return installer;
}

function pkgName(spec: string): string {
  if (spec.startsWith('@')) {
    const [scope, nameVersion] = spec.split('/');
    return `${scope}/${nameVersion?.split('@')[0] ?? ''}`;
  }
  return spec.split('@')[0];
}

async function mergeBundleEnv(env: Record<string, string>): Promise<void> {
  const current = await readEnvEntries();
  const byKey = new Map(current.map((entry) => [entry.key, entry]));
  for (const [key, value] of Object.entries(env)) byKey.set(key, { key, value });
  await writeEnvEntries([...byKey.values()]);
}

async function removeBundleEnv(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const keySet = new Set(keys);
  const current = await readEnvEntries();
  await writeEnvEntries(current.filter((entry) => !keySet.has(entry.key)));
}

async function linkCommand(command: string): Promise<void> {
  const target = `${npmBin}/${command}`;
  const linkPath = `${configDir}/bin/${command}`;
  if (!existsSync(target)) return;
  await rm(linkPath, { force: true });
  await symlink(target, linkPath);
}
