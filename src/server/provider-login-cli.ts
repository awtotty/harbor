import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getProviderStatuses, loginProvider } from './pi-auth.js';
import type { HarborEvent } from './types.js';

const rl = createInterface({ input, output });

try {
  const providerId = await chooseProvider(process.argv[2]);
  if (!providerId) process.exit(0);
  await loginProvider(providerId, printEvent, crypto.randomUUID(), async (prompt) => {
    console.log(prompt);
    return rl.question('Paste value: ');
  });
} finally {
  rl.close();
}

async function chooseProvider(arg: string | undefined): Promise<string | undefined> {
  const providers = await getProviderStatuses();
  if (arg) {
    if (providers.some((provider) => provider.id === arg)) return arg;
    throw new Error(`Unknown provider: ${arg}`);
  }

  console.log('Provider login');
  console.log('');
  providers.forEach((provider, index) => {
    const status = provider.auth.configured ? 'connected' : 'not connected';
    console.log(`${index + 1}) ${provider.name} (${provider.id}, ${status})`);
  });
  console.log('');
  const answer = await rl.question('Choose a provider number, or press Enter to skip: ');
  if (!answer.trim()) return undefined;
  const index = Number(answer) - 1;
  const provider = providers[index];
  if (!provider) throw new Error('Invalid provider selection');
  return provider.id;
}

function printEvent(event: HarborEvent): void {
  if (event.type === 'status') console.log(event.text);
  if (event.type === 'auth') {
    console.log('');
    console.log('Open this URL to log in:');
    console.log(event.url);
    if (event.instructions) console.log(event.instructions);
    console.log('');
  }
  if (event.type === 'auth_device') {
    console.log('');
    console.log(`Open: ${event.verificationUri}`);
    console.log(`Code: ${event.userCode}`);
    if (event.expiresInSeconds) console.log(`Expires in: ${event.expiresInSeconds}s`);
    console.log('');
  }
  if (event.type === 'auth_manual_request') {
    console.log('');
    console.log(event.prompt);
    console.log('');
  }
  if (event.type === 'error') console.error(`Error: ${event.message}`);
  if (event.type === 'done') console.log('Done.');
}
