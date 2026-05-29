export type HarborVersion = {
  version: string;
  commit: string;
  builtAt: string;
};

export type LatestTag = {
  tag: string;
  url: string;
  commit?: string;
};

export type UpdateStatus = {
  current: HarborVersion;
  latest?: LatestTag;
  available: boolean;
  updaterConfigured: boolean;
  updaterUrl?: string;
  error?: string;
  message?: string;
};

const tagsUrl = 'https://api.github.com/repos/awtotty/harbor/tags?per_page=100';

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
    const latest = await fetchLatestTag();
    return {
      current,
      latest,
      available: isUpdateAvailable(current.version, latest.tag),
      updaterConfigured: Boolean(updaterUrl && process.env.HARBOR_UPDATER_TOKEN),
      updaterUrl: updaterUrl ? redactUrl(updaterUrl) : undefined,
    };
  } catch (error) {
    const message = error instanceof LatestTagNotFoundError ? 'No v* release tag has been published yet.' : 'Could not check the latest GitHub tag.';
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

async function fetchLatestTag(): Promise<LatestTag> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(tagsUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'harbor-update-check' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub tag check failed: ${response.status}`);
    const data = await response.json() as Array<{ name?: string; commit?: { sha?: string; url?: string } }>;
    const tag = data.filter((candidate) => candidate.name?.startsWith('v')).sort((a, b) => compareTags(b.name ?? '', a.name ?? ''))[0];
    if (!tag?.name) throw new LatestTagNotFoundError();
    return { tag: tag.name, url: `https://github.com/awtotty/harbor/releases/tag/${tag.name}`, commit: tag.commit?.sha?.slice(0, 7) };
  } finally {
    clearTimeout(timeout);
  }
}

class LatestTagNotFoundError extends Error {
  constructor() {
    super('No v* release tag has been published yet.');
  }
}

function isUpdateAvailable(current: string, latest: string): boolean {
  return current !== 'dev' && current !== 'unknown' && current !== latest;
}

function compareTags(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
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
