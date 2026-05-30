export const runtimeUrl = process.env.HARBOR_RUNTIME_URL?.replace(/\/$/, '');
export const runtimeToken = process.env.HARBOR_RUNTIME_TOKEN ?? '';

export function isRuntimeConfigured(): boolean {
  return Boolean(runtimeUrl && runtimeToken && process.env.HARBOR_ROLE !== 'runtime');
}

export function runtimeHeaders(): Record<string, string> {
  if (!runtimeToken) throw new Error('HARBOR_RUNTIME_TOKEN is not configured');
  return { 'x-harbor-runtime-token': runtimeToken };
}

export async function runtimeHealth(): Promise<{ configured: boolean; ok: boolean; error?: string }> {
  if (!isRuntimeConfigured() || !runtimeUrl) return { configured: false, ok: false };
  try {
    const response = await fetch(`${runtimeUrl}/healthz`);
    return { configured: true, ok: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` };
  } catch (error) {
    return { configured: true, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
