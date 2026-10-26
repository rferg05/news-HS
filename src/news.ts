import type { Config } from './config';
import { FeedError, parseFeed } from './feed';
import type { Story } from './feed';
import { parseGround } from './ground';
import type { Source } from './sources';
import { titleKey, urlKey } from './text';

export const PLUGIN_ID = 'news-feed';

// ── Fetching ────────────────────────────────────────────────────────────────

export interface FetchRequest {
  url: string;
  headers?: Record<string, string>;
  cacheTtlMs?: number;
}
export type Fetcher = (req: FetchRequest) => Promise<{ status: number; body: string }>;

export function hostFetcher(): Fetcher {
  return async (req) => {
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) throw new Error('Host SDK unavailable');
    const res = await sdk.pluginFetch(PLUGIN_ID, req);
    return { status: res.status, body: await res.text() };
  };
}

const FEED_HEADERS = {
  'User-Agent': 'HomeScreens-News/1.0 (+https://homescreens.dev)',
  Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
};
// Ground News serves its pages to browsers.
const PAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 HomeScreens-News/1.0',
  Accept: 'text/html,application/xhtml+xml',
};

/** How long the host proxy may answer a repeat request from its cache. */
const PROXY_CACHE_MS = 10 * 60_000;

export async function loadSource(fetcher: Fetcher, source: Source): Promise<Story[]> {
  const ground = source.kind === 'ground';
  const { status, body } = await fetcher({ url: source.url, headers: ground ? PAGE_HEADERS : FEED_HEADERS, cacheTtlMs: PROXY_CACHE_MS });
  if (status < 200 || status >= 300) throw new FeedError('http-error', status);
  return ground ? parseGround(body) : parseFeed(body);
}

// ── What a source last said ─────────────────────────────────────────────────
// Kept outside React so a module that unmounts when its screen rotates away
// shows the same stories at once when it comes back, and two modules showing
// the same feed share one request.

/** Look again this often. */
export const REFRESH_MS = 15 * 60_000;
/** After a failed load, try again this soon. */
export const RETRY_MS = 2 * 60_000;

export interface SourceState {
  stories: Story[] | null;
  failure: string | null;
  loadedAt: number;
  loading: Promise<void> | null;
}

const states = new Map<string, SourceState>();

export function sourceState(url: string): SourceState {
  let s = states.get(url);
  if (!s) {
    s = { stories: null, failure: null, loadedAt: 0, loading: null };
    states.set(url, s);
  }
  return s;
}

export function describeFailure(e: unknown): string {
  if (e instanceof FeedError) return e.reason === 'http-error' ? `answered with an error (${e.status})` : "didn't send any stories";
  return "can't be reached";
}

/** Starts a load of every source that's due, calling `done` as each ends. */
export function refreshDue(fetcher: Fetcher, sources: Source[], log: (level: 'info' | 'warn', msg: string) => void, done: () => void, now = Date.now()) {
  for (const source of sources) {
    const s = sourceState(source.url);
    const wait = s.failure ? RETRY_MS : REFRESH_MS;
    if (s.loading || (s.loadedAt && now - s.loadedAt < wait)) continue;
    s.loading = (async () => {
      try {
        s.stories = await loadSource(fetcher, source);
        if (s.failure) log('info', `${source.label} is answering again`);
        s.failure = null;
      } catch (e) {
        const failure = describeFailure(e);
        if (s.failure !== failure) log('warn', `${source.label} ${failure}`);
        s.failure = failure;
      } finally {
        s.loadedAt = Date.now();
        s.loading = null;
      }
    })();
    s.loading.then(done);
  }
}

// ── Mixing feeds ────────────────────────────────────────────────────────────

export interface ShownStory extends Story {
  source: Source;
}

function keep(story: Story, cfg: Config, now: number): boolean {
  if (cfg.maxAgeHours > 0 && story.time !== null && now - story.time > cfg.maxAgeHours * 3600_000) return false;
  if (cfg.hideWords.length) {
    const hay = `${story.title} ${story.summary}`.toLowerCase();
    if (cfg.hideWords.some((w) => w && hay.includes(w))) return false;
  }
  return true;
}

/** Every source's stories, taking turns: the first story of each feed, then
 *  the second of each, and so on, so a busy feed can't crowd out a quiet one.
 *  Within a feed, the publisher's own order (newest or most important
 *  first). A story two feeds share shows once, under the first. */
export function mix(perSource: { source: Source; stories: Story[] }[], cfg: Config, now = Date.now()): ShownStory[] {
  const queues = perSource.map(({ source, stories }) =>
    stories.filter((s) => keep(s, cfg, now)).slice(0, cfg.perFeed).map((s) => ({ ...s, source })));
  const seen = new Set<string>();
  const out: ShownStory[] = [];
  const longest = Math.max(0, ...queues.map((q) => q.length));
  for (let i = 0; i < longest; i += 1) {
    for (const q of queues) {
      const s = q[i];
      if (!s) continue;
      const keys = [`u:${urlKey(s.url)}`, `t:${titleKey(s.title)}`];
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));
      out.push(s);
    }
  }
  return out;
}

// ── Story age ───────────────────────────────────────────────────────────────

/** "Just now", "25 min ago", "3 hr ago", "2 days ago". */
export function ageLabel(time: number | null, now = Date.now()): string {
  if (time === null) return '';
  const min = Math.floor((now - time) / 60_000);
  if (min < 5) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
