// Every feed the module can show. The manifest's settings list these same
// ids (and allowedDomains lists their hosts), so a source added here needs an
// entry there too.

export type SourceKind = 'rss' | 'ground';

export interface Source {
  /** Stable id, saved in the module's config. */
  id: string;
  kind: SourceKind;
  /** Shown above each story. */
  label: string;
  url: string;
  /** The label's color: the publisher's own, lifted to read on a dark module. */
  accent: string;
}

const ATLANTIC = '#ff7a6e';
const GROUND = '#e9e3d4';

/** The Atlantic's sections, by the path of their feed. */
export const ATLANTIC_SECTIONS: Record<string, { name: string; path: string }> = {
  all: { name: 'Latest', path: 'feed/all/' },
  'best-of': { name: 'Best of', path: 'feed/best-of/' },
  politics: { name: 'Politics', path: 'feed/channel/politics/' },
  ideas: { name: 'Ideas', path: 'feed/channel/ideas/' },
  international: { name: 'Global', path: 'feed/channel/international/' },
  national: { name: 'U.S.', path: 'feed/channel/national/' },
  business: { name: 'Economy', path: 'feed/channel/business/' },
  technology: { name: 'Technology', path: 'feed/channel/technology/' },
  science: { name: 'Science', path: 'feed/channel/science/' },
  health: { name: 'Health', path: 'feed/channel/health/' },
  culture: { name: 'Culture', path: 'feed/channel/culture/' },
  books: { name: 'Books', path: 'feed/channel/books/' },
};

export function atlanticSource(section: string): Source | null {
  const s = ATLANTIC_SECTIONS[section];
  if (!s) return null;
  return {
    id: `atlantic:${section}`,
    kind: 'rss',
    // "The Atlantic" alone for the main feed; the section otherwise, so a mix
    // of sections says which is which.
    label: section === 'all' ? 'The Atlantic' : `The Atlantic · ${s.name}`,
    url: `https://www.theatlantic.com/${s.path}`,
    accent: ATLANTIC,
  };
}

export const GROUND_PAGES: Record<string, { name: string; path: string }> = {
  top: { name: 'Top stories', path: '' },
  blindspot: { name: 'Blindspot', path: 'blindspot' },
};

export function groundSource(page: string): Source | null {
  const p = GROUND_PAGES[page];
  if (!p) return null;
  return {
    id: `ground:${page}`,
    kind: 'ground',
    label: page === 'top' ? 'Ground News' : `Ground News · ${p.name}`,
    url: `https://ground.news/${p.path}`,
    accent: GROUND,
  };
}

/** A topic's slug from whatever was typed: a ground.news/interest/… link,
 *  the slug itself, or the topic's name ("Israel Gaza" → "israel-gaza"). */
export function groundTopicSlug(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const link = /ground\.news\/interest\/([^/?#\s]+)/i.exec(text);
  const slug = (link ? link[1] : text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

const titleCase = (slug: string) =>
  slug.replace(/_[0-9a-f]{4,}$/, '').split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function groundTopicSource(input: string): Source | null {
  const slug = groundTopicSlug(input);
  if (!slug) return null;
  return {
    id: `ground-topic:${slug}`,
    kind: 'ground',
    label: `Ground News · ${titleCase(slug)}`,
    url: `https://ground.news/interest/${slug}`,
    accent: GROUND,
  };
}

const rss = (id: string, label: string, url: string, accent: string): Source => ({ id, kind: 'rss', label, url, accent });

/** Other publishers' top-stories feeds, each checked to answer with stories.
 *  AP and Reuters have no feeds of their own any more; Google News searches
 *  stand in, limited to the last two days (it sorts by relevance, not date). */
export const PUBLISHERS: Source[] = [
  rss('nyt', 'The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', '#f2f2f2'),
  rss('nyt-world', 'NYT · World', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', '#f2f2f2'),
  rss('ap', 'Associated Press', 'https://news.google.com/rss/search?q=source:%22Associated%20Press%22+when:2d&hl=en-US&gl=US&ceid=US:en', '#ff9b85'),
  rss('reuters', 'Reuters', 'https://news.google.com/rss/search?q=source:reuters+when:2d&hl=en-US&gl=US&ceid=US:en', '#ffab5e'),
  rss('npr', 'NPR', 'https://feeds.npr.org/1001/rss.xml', '#8db8ff'),
  rss('bbc', 'BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', '#ff8f8f'),
  rss('bbc-world', 'BBC · World', 'https://feeds.bbci.co.uk/news/world/rss.xml', '#ff8f8f'),
  rss('guardian', 'The Guardian', 'https://www.theguardian.com/us-news/rss', '#8cc8ff'),
  rss('pbs', 'PBS News', 'https://www.pbs.org/newshour/feeds/rss/headlines', '#8fe3c0'),
  rss('abc', 'ABC News', 'https://abcnews.com/abcnews/topstories', '#ffd27a'),
  rss('cbs', 'CBS News', 'https://www.cbsnews.com/latest/rss/main', '#a9c8ff'),
  rss('ars', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', '#ffa04d'),
  rss('verge', 'The Verge', 'https://www.theverge.com/rss/index.xml', '#d7a8ff'),
  rss('wired', 'Wired', 'https://www.wired.com/feed/rss', '#f2f2f2'),
  rss('espn', 'ESPN', 'https://www.espn.com/espn/rss/news', '#ff7676'),
];

export const publisherSource = (id: string): Source | null => PUBLISHERS.find((p) => p.id === id) ?? null;
