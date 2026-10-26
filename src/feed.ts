// RSS 2.0, RSS 1.0 (RDF) and Atom, read with the browser's XML parser.

import { bestImage, upscale } from './images';
import type { ImageCandidate } from './images';
import { cleanUrl, htmlToText } from './text';

export interface StoryImage {
  src: string;
  /** The feed's own URL, when `src` asks the CDN for a different size. */
  fallback?: string;
}

/** How Ground News rates a story's coverage, in percent of rated sources. */
export interface Coverage {
  left: number;
  center: number;
  right: number;
  /** Outlets covering the story. */
  sources: number;
  /** A Blindspot: a story one side's outlets barely cover. */
  blindspotFor: 'left' | 'right' | null;
}

export interface Story {
  id: string;
  title: string;
  /** Plain text, never HTML. */
  summary: string;
  url: string;
  image: StoryImage | null;
  /** Epoch ms, or null when the feed doesn't say. */
  time: number | null;
  coverage: Coverage | null;
}

export class FeedError extends Error {
  constructor(readonly reason: 'not-a-feed' | 'http-error', readonly status?: number) {
    super(reason === 'http-error' ? `answered ${status}` : 'is not a news feed');
  }
}

// ── Elements, by local name so namespace prefixes don't matter ──────────────

const kids = (el: Element, name: string): Element[] => Array.from(el.children).filter((c) => c.localName === name);
const kid = (el: Element, name: string): Element | undefined => kids(el, name)[0];
const text = (el: Element | undefined): string => el?.textContent?.trim() ?? '';
const attr = (el: Element, name: string): string => el.getAttribute(name)?.trim() ?? '';

const httpUrl = (s: string): string | null => (/^https?:\/\//i.test(s) ? s : null);
const width = (el: Element): number | null => {
  const w = Number(attr(el, 'width'));
  return Number.isFinite(w) && w > 0 ? w : null;
};

function imageCandidates(item: Element, html: string): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  const add = (url: string | null, w: number | null, thumbnail: boolean) => { if (url) out.push({ url, width: w, thumbnail }); };
  const visit = (el: Element) => {
    for (const t of kids(el, 'thumbnail')) add(httpUrl(attr(t, 'url')), width(t), true);
    for (const c of kids(el, 'content')) {
      const type = attr(c, 'type');
      const medium = attr(c, 'medium');
      const url = attr(c, 'url');
      // Media RSS makes both optional: The Atlantic sends only a url.
      if (url && (type.startsWith('image/') || medium === 'image' || (!type && !medium))) add(httpUrl(url), width(c), false);
    }
    for (const g of kids(el, 'group')) visit(g);
  };
  visit(item);
  for (const e of kids(item, 'enclosure')) {
    if (attr(e, 'type').startsWith('image/')) add(httpUrl(attr(e, 'url')), null, false);
  }
  // CBS: <image>https://…</image>; iTunes: <itunes:image href>.
  for (const i of kids(item, 'image')) add(httpUrl(attr(i, 'href') || text(i)), null, false);
  // Atom enclosures.
  for (const l of kids(item, 'link')) {
    if (attr(l, 'rel') === 'enclosure' && attr(l, 'type').startsWith('image/')) add(httpUrl(attr(l, 'href')), null, false);
  }
  // Last resort: the first picture in the story's own HTML (NPR).
  if (out.length === 0 && html) {
    for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      add(httpUrl(m[1].replace(/&amp;/g, '&')), null, false);
    }
  }
  return out;
}

function storyImage(item: Element, html: string): StoryImage | null {
  const best = bestImage(imageCandidates(item, html));
  if (!best) return null;
  const src = upscale(best.url);
  return src === best.url ? { src } : { src, fallback: best.url };
}

function parseTime(s: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** The headline as plain text. Aggregators (Google News) end it with the
 *  publisher's name, which the module shows on its own line already. */
function headline(item: Element): string {
  let title = htmlToText(text(kid(item, 'title')));
  const publisher = text(kid(item, 'source'));
  if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3)).trim();
  return title;
}

function summaryOf(item: Element, title: string, html: string): string {
  // An aggregator's description is a list of links to the same story.
  if (kid(item, 'source')) return '';
  const s = htmlToText(html);
  return s === title ? '' : s;
}

function rssItem(item: Element): Story | null {
  const title = headline(item);
  const guid = kid(item, 'guid');
  const link = httpUrl(text(kid(item, 'link')))
    ?? (guid && attr(guid, 'isPermaLink') !== 'false' ? httpUrl(text(guid)) : null)
    ?? httpUrl(attr(item, 'rdf:about'));
  if (!title || !link) return null;
  const description = text(kid(item, 'description'));
  const encoded = text(kid(item, 'encoded'));
  return {
    id: text(guid) || link,
    title,
    summary: summaryOf(item, title, description || encoded),
    url: cleanUrl(link),
    image: storyImage(item, encoded || description),
    time: parseTime(text(kid(item, 'pubDate')) || text(kid(item, 'date'))),
    coverage: null,
  };
}

function atomEntry(entry: Element): Story | null {
  const title = headline(entry);
  const links = kids(entry, 'link');
  const alt = links.find((l) => attr(l, 'rel') === 'alternate' || !attr(l, 'rel'));
  const link = alt ? httpUrl(attr(alt, 'href')) : null;
  if (!title || !link) return null;
  const summary = text(kid(entry, 'summary'));
  const content = text(kid(entry, 'content'));
  return {
    id: text(kid(entry, 'id')) || link,
    title,
    // The Atlantic's summary is the story's dek; its content, the whole story.
    summary: summaryOf(entry, title, summary || content),
    url: cleanUrl(link),
    image: storyImage(entry, content || summary),
    time: parseTime(text(kid(entry, 'published')) || text(kid(entry, 'updated'))),
    coverage: null,
  };
}

export function parseFeed(xml: string): Story[] {
  const doc = new DOMParser().parseFromString(xml.replace(/^﻿/, '').trimStart(), 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length > 0) throw new FeedError('not-a-feed');
  let stories: (Story | null)[];
  if (root.localName === 'feed') {
    stories = kids(root, 'entry').map(atomEntry);
  } else if (root.localName === 'rss' || root.localName === 'RDF') {
    const channel = kid(root, 'channel');
    // RSS 2.0 nests items in the channel; RSS 1.0 puts them beside it.
    const items = [...(channel ? kids(channel, 'item') : []), ...kids(root, 'item')];
    stories = items.map(rssItem);
  } else {
    throw new FeedError('not-a-feed');
  }
  return stories.filter((s): s is Story => s !== null);
}
