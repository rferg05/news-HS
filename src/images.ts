// Feeds advertise pictures at whatever size their publisher picked, often far
// too small for a module that fills a wall display (BBC: 240px) and sometimes
// absurdly large (NPR: 6000px). These pick the best one a story offers and
// ask the publisher's CDN for a sensible size where it resizes by URL.

/** The width a full-module photo wants on a 1080p screen. */
export const TARGET_WIDTH = 1200;
/** Below this, a photo blown up to fill the module is a blur: show none. */
const MIN_WIDTH = 300;

export interface ImageCandidate {
  url: string;
  width: number | null;
  /** `media:thumbnail` is the small copy by definition. */
  thumbnail: boolean;
}

/** The candidate closest above the target width; failing that, a full-size
 *  copy of unknown size, then the largest declared, then any thumbnail.
 *  (After the host's own news module, src/lib/news/parse-feed.ts.) */
export function bestImage(candidates: ImageCandidate[]): ImageCandidate | null {
  const usable = candidates.filter((c) => !looksTiny(c));
  const clears = usable.filter((c) => c.width !== null && c.width >= TARGET_WIDTH).sort((a, b) => a.width! - b.width!);
  if (clears.length) return clears[0];
  const unsized = usable.find((c) => c.width === null && !c.thumbnail);
  if (unsized) return unsized;
  const sized = usable.filter((c) => c.width !== null).sort((a, b) => b.width! - a.width!);
  return sized[0] ?? usable[0] ?? null;
}

/** Declared, or written into the URL ("/thumbnail/60x60/"), as too small, or
 *  a tracking pixel. */
function looksTiny(c: ImageCandidate): boolean {
  if (/pixel|spacer|tracking|1x1/i.test(c.url)) return true;
  if (upscale(c.url) !== c.url) return false;
  if (c.width !== null && c.width < MIN_WIDTH) return true;
  const inUrl = /(?:^|[/_-])(\d{2,4})x(\d{2,4})(?=[/_.-])/.exec(c.url);
  return !!inUrl && Number(inUrl[1]) < MIN_WIDTH;
}

/** Widths BBC's own pages ask its image CDN for. */
const BBC_LADDER = [240, 320, 400, 480, 624, 800, 976, 1248, 1600];

/** The same picture at a size that fills the module, where the CDN resizes
 *  by URL; the URL unchanged otherwise. A rule gone stale costs nothing: the
 *  display falls back to the feed's own URL if this one fails to load. */
export function upscale(url: string): string {
  let host = '';
  try { host = new URL(url).hostname; } catch { return url; }

  if (/(^|\.)bbci\.co\.uk$/.test(host)) {
    const want = BBC_LADDER.find((w) => w >= TARGET_WIDTH)!;
    return url.replace(/(\/ace\/[a-z]+\/)(\d{2,4})\//, (all, pre: string, w: string) => (Number(w) < want ? `${pre}${want}/` : all));
  }
  // NPR's Brightspot CDN: ".../resize/6000x4000!/..." serves the original.
  if (/(^|\.)brightspotcdn\.com$/.test(host)) {
    return url.replace(/\/resize\/(\d+)x(\d+)(!?)\//, (all, w: string, h: string, bang: string) => {
      const width = Number(w);
      if (width <= 1600) return all;
      return `/resize/1600x${Math.round((Number(h) * 1600) / width)}${bang}/`;
    });
  }
  // Ground News's Bunny CDN resizes on ?width.
  if (host === 'groundnews.b-cdn.net' && !/[?&]width=/.test(url)) {
    return `${url}${url.includes('?') ? '&' : '?'}width=1600`;
  }
  return url;
}
