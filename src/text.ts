// ── Markup ──────────────────────────────────────────────────────────────────

/** The text of a fragment of HTML, whitespace collapsed. DOMParser builds an
 *  inert document: nothing in it loads or runs. */
export function htmlToText(html: string): string {
  if (!html) return '';
  if (!/[<&]/.test(html)) return html.replace(/\s+/g, ' ').trim();
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  // Block ends become spaces, so "<p>One.</p><p>Two.</p>" doesn't run together.
  doc.querySelectorAll('p, br, li, div, h1, h2, h3, h4, figcaption').forEach((el) => el.append(' '));
  doc.querySelectorAll('script, style, figure, img, iframe').forEach((el) => el.remove());
  return (doc.body.textContent ?? '').replace(/[\s ]+/g, ' ').trim();
}

// ── Sentences ───────────────────────────────────────────────────────────────

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'mt', 'ft', 'no', 'vs', 'c', 'ca',
  'e.g', 'i.e', 'u.s', 'u.k', 'u.n', 'inc', 'ltd', 'co', 'corp', 'gen', 'col', 'lt', 'sgt', 'capt', 'rev', 'prof',
  'sen', 'rep', 'gov', 'pres', 'jan', 'feb', 'mar', 'apr', 'aug', 'sept', 'sep', 'oct', 'nov', 'dec', 'approx', 'est']);

/** The first `n` sentences of a paragraph. Doesn't split after initials
 *  ("J. D. Vance") or common abbreviations ("Sen. Smith", "U.S. Army"). */
export function firstSentences(text: string, n: number): string {
  const re = /[.!?]["”’)\]]*\s+(?=["“‘(]?[A-Z0-9])/g;
  let count = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index + 1);
    const word = /(\S+)\.$/.exec(before)?.[1] ?? '';
    const bare = word.replace(/^["“‘(]+/, '').toLowerCase();
    if (word && (/^[A-Z]$/.test(word.replace(/^["“‘(]+/, '')) || ABBREVIATIONS.has(bare))) continue;
    count += 1;
    if (count >= n) return text.slice(0, m.index + m[0].trimEnd().length).trim();
  }
  return text.trim();
}

// ── Links ───────────────────────────────────────────────────────────────────

/** A story link without its tracking parameters: a shorter link makes a
 *  coarser QR code, which a phone reads from farther away. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|mc_|ito$|cmpid$|ref$|smid$|partner$|taid$)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** One key for the same story reached by two links (http/https, www or
 *  not, trailing slash, tracking parameters). */
export function urlKey(url: string): string {
  return cleanUrl(url).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
}

/** One key for the same headline from two feeds. */
export const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
