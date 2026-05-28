import type { FastifyInstance } from 'fastify';
import { readEnvEntries, writeEnvEntries, configDir, workspaceDir, piAgentDir } from '../config.js';
import { readAuthorizedKeys, sshCommand, writeAuthorizedKeys } from '../ssh.js';

export async function registerConfigRoutes(app: FastifyInstance) {
  app.get('/api/status', async () => ({ ok: true, name: 'Harbor', configDir, workspaceDir, piAgentDir, piSessionDir: `${configDir}/sessions`, ssh: sshCommand() }));

  app.get('/api/ssh', async () => ({ command: sshCommand(), authorizedKeys: await readAuthorizedKeys() }));
  app.post('/api/ssh/authorized-keys', async (request) => {
    const body = request.body as { authorizedKeys?: string };
    await writeAuthorizedKeys(body.authorizedKeys ?? '');
    return { ok: true };
  });

  app.get('/api/env', async () => ({ entries: await readEnvEntries() }));
  app.post('/api/env', async (request) => {
    const body = request.body as { entries?: { key: string; value: string }[] };
    await writeEnvEntries(body.entries ?? []);
    return { ok: true };
  });
}
