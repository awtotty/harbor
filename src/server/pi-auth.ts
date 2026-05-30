import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { piAgentDir } from './config.js';
import { readHarborConfig, writeHarborConfig } from './app-config.js';
import type { EventSink } from './types.js';

const pendingManualInputs = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>();

export function submitManualLoginInput(loginId: string, value: string): boolean {
  const pending = pendingManualInputs.get(loginId);
  if (!pending) return false;
  pendingManualInputs.delete(loginId);
  pending.resolve(value);
  return true;
}

export function cancelManualLoginInput(loginId: string, reason = 'Login input request expired. Start provider login again.'): boolean {
  const pending = pendingManualInputs.get(loginId);
  if (!pending) return false;
  pendingManualInputs.delete(loginId);
  pending.reject(new Error(reason));
  return true;
}

export function createAuthStorage(): AuthStorage {
  return AuthStorage.create(`${piAgentDir}/auth.json`);
}

export function createModelRegistry(authStorage = createAuthStorage()): ModelRegistry {
  return ModelRegistry.create(authStorage, `${piAgentDir}/models.json`);
}

export async function getProviderStatuses() {
  const authStorage = createAuthStorage();
  const modelRegistry = createModelRegistry(authStorage);
  return authStorage.getOAuthProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
    auth: modelRegistry.getProviderAuthStatus(provider.id),
  }));
}

export async function getModelOptions() {
  const authStorage = createAuthStorage();
  const modelRegistry = createModelRegistry(authStorage);
  const config = await readHarborConfig();
  return {
    selectedModel: config.selectedModel,
    models: modelRegistry.getAvailable().map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      displayName: `${modelRegistry.getProviderDisplayName(model.provider)} / ${model.name}`,
      reasoning: model.reasoning,
    })),
  };
}

export async function selectModel(provider: string, id: string) {
  const current = await readHarborConfig();
  await writeHarborConfig({ ...current, selectedModel: { provider, id } });
}

export async function loginProvider(providerId: string, sink: EventSink, loginId: string = crypto.randomUUID(), manualCodeInput?: (prompt: string) => Promise<string>): Promise<void> {
  const authStorage = createAuthStorage();
  createModelRegistry(authStorage);
  sink({ type: 'status', text: `Starting login for ${providerId}` });
  await authStorage.login(providerId, {
    onAuth: (info) => {
      sink({ type: 'auth', url: info.url, instructions: info.instructions });
    },
    onDeviceCode: (info) => {
      sink({
        type: 'auth_device',
        verificationUri: info.verificationUri,
        userCode: info.userCode,
        intervalSeconds: info.intervalSeconds,
        expiresInSeconds: info.expiresInSeconds,
      });
    },
    onPrompt: async (prompt) => {
      sink({ type: 'status', text: `${prompt.message}${prompt.placeholder ? ` (${prompt.placeholder})` : ''}` });
      if (prompt.allowEmpty) return '';
      throw new Error('This login flow requested interactive input that Harbor does not support yet.');
    },
    onManualCodeInput: async () => {
      const prompt = 'If the browser redirect to localhost:1455 fails, copy the full localhost URL from the address bar and paste it here.';
      sink({ type: 'auth_manual_request', loginId, prompt });
      if (manualCodeInput) return manualCodeInput(prompt);
      return await new Promise<string>((resolve, reject) => {
        pendingManualInputs.set(loginId, { resolve, reject });
      });
    },
    onSelect: async (prompt) => {
      sink({ type: 'status', text: `${prompt.message}: ${prompt.options.map((o) => o.label).join(', ')}` });
      return prompt.options[0]?.id;
    },
    onProgress: (message) => sink({ type: 'status', text: message }),
  });
  sink({ type: 'status', text: `Login complete for ${providerId}` });
  sink({ type: 'done' });
}

export async function logoutProvider(providerId: string): Promise<void> {
  const authStorage = createAuthStorage();
  authStorage.logout(providerId);
}
