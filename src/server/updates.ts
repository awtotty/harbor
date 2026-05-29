export type HarborVersion = {
  version: string;
  commit: string;
  builtAt: string;
};

export type LatestRelease = {
  tag: string;
  url: string;
  publishedAt?: string;
};

export type UpdateStatus = {
  current: HarborVersion;
  latest?: LatestRelease;
  available: boolean;
  updaterConfigured: boolean;
  updaterUrl?: string;
  error?: string;
  message?: string;
};

const latestReleaseUrl = 'https://api.github.com/repos/awtotty/harbor/releases/latest';

export function currentVersion(): HarborVersion {
  return {
    version: process.env.HARBOR_VERSION ?? 'dev',
    commit: process.env.HARBOR_COMMIT ?? 'unknown',
    builtAt: process.env.HARBOR_BUILT_AT ?? 'unknown',
  };
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const current = currentVersion();
  const updaterUrl = process.env.HARBOR_UPDATER_URL;
  try {
    const latest = await fetchLatestRelease();
    return {
      current,
      latest,
      available: isUpdateAvailable(current.version, latest.tag),
      updaterConfigured: Boolean(updaterUrl && process.env.HARBOR_UPDATER_TOKEN),
      updaterUrl: updaterUrl ? redactUrl(updaterUrl) : undefined,
    };
  } catch (error) {
    const message = error instanceof LatestReleaseNotFoundError ? 'No GitHub release has been published yet.' : 'Could not check the latest GitHub release.';
    return {
      current,
      available: false,
      updaterConfigured: Boolean(updaterUrl && process.env.HARBOR_UPDATER_TOKEN),
      updaterUrl: updaterUrl ? redactUrl(updaterUrl) : undefined,
      error: error instanceof Error ? error.message : String(error),
      message,
    };
  }
}

async function fetchLatestRelease(): Promise<LatestRelease> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(latestReleaseUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'harbor-update-check' },
      signal: controller.signal,
    });
    if (response.status === 404) throw new LatestReleaseNotFoundError();
    if (!response.ok) throw new Error(`GitHub latest release check failed: ${response.status}`);
    const data = await response.json() as { tag_name?: string; html_url?: string; published_at?: string };
    if (!data.tag_name || !data.html_url) throw new Error('GitHub latest release response was missing tag data');
    return { tag: data.tag_name, url: data.html_url, publishedAt: data.published_at };
  } finally {
    clearTimeout(timeout);
  }
}

class LatestReleaseNotFoundError extends Error {
  constructor() {
    super('No GitHub release has been published yet.');
  }
}

function isUpdateAvailable(current: string, latest: string): boolean {
  return current !== 'dev' && current !== 'unknown' && current !== latest;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return value.replace(/:[^:@/]+@/, ':***@');
  }
}
