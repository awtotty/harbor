import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const npmPackagePattern = /^npm:(?:@[^/\s]+\/)?[^@\s]+@(?:\d+|\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/;
const npmGlobalPattern = /^(?:@[^/\s]+\/)?[^@\s]+@(?:\d+|\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/;

test('default Pi packages are pinned to an npm major or exact version', async () => {
  const config = JSON.parse(await readFile('packages.default.json', 'utf8')) as { packages?: string[] };
  assert.ok(Array.isArray(config.packages));
  assert.ok(config.packages.length > 0);
  for (const source of config.packages) assert.match(source, npmPackagePattern, `${source} must include an explicit major or exact version`);
});

test('bundle npm globals are pinned to an npm major or exact version', async () => {
  const config = JSON.parse(await readFile('bundles.default.json', 'utf8')) as { bundles?: Array<{ npmGlobals?: string[] }> };
  for (const bundle of config.bundles ?? []) {
    for (const source of bundle.npmGlobals ?? []) assert.match(source, npmGlobalPattern, `${source} must include an explicit major or exact version`);
  }
});

test('Docker base image is pinned to a Node patch tag on Debian Trixie', async () => {
  const dockerfile = await readFile('Dockerfile', 'utf8');
  assert.match(dockerfile, /^FROM node:\d+\.\d+\.\d+-trixie$/m);
});
