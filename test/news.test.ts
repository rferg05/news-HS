// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { parseFeed } from '../src/feed';
import type { Story } from '../src/feed';
import { parseGround } from '../src/ground';
import { bestImage, upscale } from '../src/images';
import { ageLabel, mix } from '../src/news';
import { readConfig } from '../src/config';
import { groundTopicSlug, groundTopicSource } from '../src/sources';
import { cleanUrl, firstSentences, htmlToText } from '../src/text';
import { qrFor } from '../src/qr';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const sane = (s: Story) => {
  expect(s.title.length).toBeGreaterThan(5);
  expect(s.title).not.toMatch(/<|&[a-z]+;/);
  expect(s.summary).not.toMatch(/<[a-z]/i);
  expect(s.url).toMatch(/^https:\/\//);
};

describe('The Atlantic (Atom)', () => {
  const stories = parseFeed(fixture('atlantic-all.xml'));
  it('reads every entry with its dek, picture, time and a clean link', () => {
    expect(stories.length).toBe(25);
    stories.forEach(sane);
    const s = stories[0];
    expect(s.title).toBe('Peeling the Orange');
    expect(s.summary).toBe('A poem');
    expect(s.url).toBe('https://www.theatlantic.com/books/2026/10/poem-howard-altmann-peeling/689127/');
    expect(s.image?.src).toMatch(/^https:\/\/cdn\.theatlantic\.com\/thumbor\//);
    expect(s.time).toBe(Date.parse('2026-10-25T12:00:00-04:00'));
    expect(stories.filter((x) => x.image).length).toBeGreaterThan(20);
  });
});

describe('RSS feeds', () => {
  it('BBC: asks the CDN for a full-size picture, keeping the feed\'s as a fallback', () => {
    const s = parseFeed(fixture('bbc.xml'))[0];
    sane(s);
    expect(s.image?.src).toMatch(/\/ace\/standard\/1248\//);
    expect(s.image?.fallback).toMatch(/\/ace\/standard\/240\//);
  });

  it('NYT: takes the media:content picture', () => {
    const list = parseFeed(fixture('nyt.xml'));
    list.forEach(sane);
    expect(list.filter((s) => s.image).length).toBeGreaterThan(list.length / 2);
  });

  it('NPR: finds the picture in the story HTML and shrinks the 6000px original', () => {
    const list = parseFeed(fixture('npr.xml'));
    list.forEach(sane);
    const img = list.find((s) => s.image)!.image!;
    expect(img.src).toMatch(/resize\/1600x\d+!/);
    expect(img.src).not.toMatch(/npr-rss-pixel/);
  });

  it('CBS: drops 60px thumbnails rather than blowing them up', () => {
    const list = parseFeed(fixture('cbs.xml'));
    list.forEach(sane);
    expect(list.every((s) => s.image === null)).toBe(true);
  });

  it('Guardian: a full-size copy, not the 140px one', () => {
    const s = parseFeed(fixture('guardian.xml')).find((x) => x.image)!;
    expect(s.image!.src).not.toContain('width=140');
  });

  it('Google News (AP): no publisher suffix on the headline and no link-list summary', () => {
    const list = parseFeed(fixture('google-ap.xml'));
    list.forEach(sane);
    expect(list.some((s) => / - Associated Press$/.test(s.title))).toBe(false);
    expect(list.every((s) => s.summary === '')).toBe(true);
  });

  it('rejects a page that is not a feed', () => {
    expect(() => parseFeed('<html><body>Hello</body></html>')).toThrow();
    expect(() => parseFeed('not xml at all')).toThrow();
  });
});

describe('Ground News pages', () => {
  it('Blindspot: every story with its coverage split and whose blindspot it is', () => {
    const list = parseGround(fixture('ground-blindspot.html'));
    expect(list.length).toBe(8);
    list.forEach(sane);
    for (const s of list) {
      expect(s.url).toMatch(/^https:\/\/ground\.news\/article\/[a-z0-9_-]+$/);
      const c = s.coverage!;
      expect(c.left + c.center + c.right).toBeGreaterThanOrEqual(98);
      expect(c.left + c.center + c.right).toBeLessThanOrEqual(102);
      expect(['left', 'right']).toContain(c.blindspotFor);
    }
    expect(list[0].coverage).toMatchObject({ left: 20, center: 20, right: 60, blindspotFor: 'left' });
  });

  it('a topic page: stories with photos, summaries and source counts', () => {
    const list = parseGround(fixture('ground-topic.html'));
    expect(list.length).toBe(12);
    list.forEach(sane);
    expect(list.filter((s) => s.image).length).toBeGreaterThan(4);
    expect(list.every((s) => s.coverage && s.coverage.sources > 0)).toBe(true);
    expect(list.filter((s) => s.summary.length > 40).length).toBeGreaterThan(6);
    const img = list.find((s) => s.image)!.image!;
    expect(img.src).toMatch(/groundnews\.b-cdn\.net\/.+\?width=1600$/);
  });

  it('says so when a page holds no stories, rather than showing nothing', () => {
    expect(() => parseGround('<html><script>self.__next_f.push([1,"0:[\\"x\\"]\\n"])</script></html>')).toThrow();
  });
});

describe('topics', () => {
  it('takes a link, a slug or a name', () => {
    expect(groundTopicSlug('https://ground.news/interest/israeli-palestinian-conflict?x=1')).toBe('israeli-palestinian-conflict');
    expect(groundTopicSlug('chicago-bears')).toBe('chicago-bears');
    expect(groundTopicSlug("  Chicago Bears' ")).toBe('chicago-bears');
    expect(groundTopicSlug('   ')).toBeNull();
    expect(groundTopicSource('artificial-intelligence')!.label).toBe('Ground News · Artificial Intelligence');
  });
});

describe('mixing', () => {
  const story = (id: string, title: string, time: number | null = Date.now()): Story =>
    ({ id, title, summary: '', url: `https://x.test/${id}`, image: null, time, coverage: null });
  const cfg = readConfig({ atlantic: ['all'], ground: ['top'] });
  const [a, g] = cfg.sources;

  it('takes turns between feeds', () => {
    const out = mix([
      { source: a, stories: [story('a1', 'A one'), story('a2', 'A two'), story('a3', 'A three')] },
      { source: g, stories: [story('g1', 'G one')] },
    ], cfg);
    expect(out.map((s) => s.id)).toEqual(['a1', 'g1', 'a2', 'a3']);
  });

  it('shows a story two feeds share once, and drops old and hidden ones', () => {
    const c = { ...cfg, hideWords: ['murder'] };
    const out = mix([
      { source: a, stories: [story('a1', 'Same Story!'), story('a2', 'A Murder Case'), story('a3', 'Old', Date.now() - 80 * 3600_000)] },
      { source: g, stories: [story('g1', 'same story'), story('g2', 'Fresh')] },
    ], c);
    expect(out.map((s) => s.id)).toEqual(['a1', 'g2']);
  });

  it('keeps at most perFeed from each', () => {
    const many = Array.from({ length: 30 }, (_, i) => story(`a${i}`, `Story ${i}`));
    expect(mix([{ source: a, stories: many }], { ...cfg, perFeed: 4 }).length).toBe(4);
  });
});

describe('config', () => {
  it('defaults to The Atlantic and Ground News top stories', () => {
    expect(readConfig({}).sources.map((s) => s.id)).toEqual(['atlantic:all', 'ground:top']);
  });
  it('reads lists from the editor or from text, ignoring unknown ids', () => {
    const c = readConfig({ atlantic: 'politics,nope', ground: [], publishers: ['bbc', 'npr'], groundTopics: 'Chicago Bears, ' });
    expect(c.sources.map((s) => s.id)).toEqual(['atlantic:politics', 'ground-topic:chicago-bears', 'bbc', 'npr']);
  });
});

describe('text', () => {
  it('cuts to whole sentences', () => {
    expect(firstSentences('Sen. J. D. Vance spoke in the U.S. Capitol. He left. Then more.', 1)).toBe('Sen. J. D. Vance spoke in the U.S. Capitol.');
  });
  it('turns HTML into text without running blocks together', () => {
    expect(htmlToText('<p>One.</p><p>Two &amp; three.</p>')).toBe('One. Two & three.');
  });
  it('strips tracking from links', () => {
    expect(cleanUrl('https://www.theatlantic.com/a/1/?utm_source=feed&id=2#x')).toBe('https://www.theatlantic.com/a/1/?id=2');
  });
  it('labels age', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    expect(ageLabel(now - 2 * 60_000, now)).toBe('Just now');
    expect(ageLabel(now - 25 * 60_000, now)).toBe('25 min ago');
    expect(ageLabel(now - 3 * 3600_000, now)).toBe('3 hr ago');
    expect(ageLabel(now - 30 * 3600_000, now)).toBe('Yesterday');
  });
});

describe('images', () => {
  it('prefers the copy just over the target width', () => {
    expect(bestImage([
      { url: 'https://x.test/a.jpg', width: 600, thumbnail: false },
      { url: 'https://x.test/b.jpg', width: 3000, thumbnail: false },
      { url: 'https://x.test/c.jpg', width: 1400, thumbnail: false },
    ])!.url).toBe('https://x.test/c.jpg');
  });
  it("leaves URLs it can't resize alone", () => {
    expect(upscale('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});

describe('QR codes', () => {
  it('decode back to the story link', () => {
    const url = 'https://ground.news/article/new-york-archdiocese-nears-us800-million-abuse-settlement';
    const qr = qrFor(url);
    const scale = 4;
    const side = (qr.size + 8) * scale;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const r = Math.floor(y / scale) - 4;
        const c = Math.floor(x / scale) - 4;
        if (r >= 0 && c >= 0 && r < qr.size && c < qr.size && qr.isDark(r, c)) {
          const i = (y * side + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
    expect(jsQR(data, side, side)?.data).toBe(url);
  });
});
