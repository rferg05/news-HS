// Ground News has no public feed. Its pages are server-rendered with Next.js,
// which embeds the data each page was drawn from as a stream of rows:
//
//   self.__next_f.push([1,"<row>\n<row>\n…"])
//
// where a row is `<hex id>:<JSON>`. Every story on the page is an object in
// one of those rows with a title, a slug and its coverage split. This reads
// the rows and keeps every object of that shape, so it follows Ground News's
// own field names but not the page's layout or the order of keys.

import { upscale } from './images';
import type { Coverage, Story } from './feed';
import { FeedError } from './feed';

const PUSH = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
const ROW = /^[0-9a-f]+:([[{].*)$/;

/** The rows of a page's embedded data, joined back into one string. */
function payload(html: string): string {
  let out = '';
  for (const m of html.matchAll(PUSH)) {
    try { out += JSON.parse(m[1]) as string; } catch { /* a chunk we can't read */ }
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' && v !== '$undefined' ? v.trim() : '');
const pct = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0);

function isStory(o: Obj): boolean {
  return !!str(o.title) && !!str(o.slug) && isObj(o.blindspotData);
}

function coverage(o: Obj): Coverage | null {
  const b = o.blindspotData as Obj;
  const left = pct(b.leftPercent);
  const center = pct(b.centerPercent);
  const right = pct(b.rightPercent);
  if (left + center + right <= 0) return null;
  const count = typeof o.sourceCount === 'number' ? o.sourceCount : typeof o.biasSourceCount === 'number' ? o.biasSourceCount : 0;
  const blind = b.blindspotFor === 'left' || b.blindspotFor === 'right' ? b.blindspotFor : null;
  return { left, center, right, sources: count, blindspotFor: blind };
}

function story(o: Obj): Story {
  const media = [o.latestMedia, o.fallbackMedia].find((m) => isObj(m) && str(m.url) && !m.nsfw && !m.isVideo) as Obj | undefined;
  const src = media ? str(media.url) : '';
  const time = Date.parse(str(o.start));
  return {
    id: str(o.id) || str(o.slug),
    title: str(o.title),
    summary: str(o.description) || str(o.summary),
    url: `https://ground.news/article/${encodeURIComponent(str(o.slug))}`,
    image: src ? { src: upscale(src), fallback: src } : null,
    time: Number.isFinite(time) ? time : null,
    coverage: coverage(o),
  };
}

/** Every story on a Ground News page, in the order the page shows them. */
export function parseGround(html: string): Story[] {
  const found = new Map<string, Story>();
  const walk = (v: unknown, depth: number): void => {
    if (depth > 60) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (!isObj(v)) return;
    if (isStory(v)) {
      const s = story(v);
      if (!found.has(s.id)) found.set(s.id, s);
    }
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  for (const line of payload(html).split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    try { walk(JSON.parse(m[1]), 0); } catch { /* not a JSON row */ }
  }
  if (found.size === 0) throw new FeedError('not-a-feed');
  return [...found.values()];
}
