import { atlanticSource, groundSource, groundTopicSource, publisherSource } from './sources';
import type { Source } from './sources';

export type PhotoLayout = 'auto' | 'side' | 'top' | 'background' | 'off';
export type QrSize = 'small' | 'medium' | 'large';

export interface Config {
  /** In the order they take turns: The Atlantic, Ground News, then the rest. */
  sources: Source[];
  rotateSeconds: number;
  photo: PhotoLayout;
  summarySentences: number;
  coverageBar: boolean;
  /** 0 keeps stories of any age. */
  maxAgeHours: number;
  perFeed: number;
  hideWords: string[];
  qr: boolean;
  qrSize: QrSize;
}

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback;

/** A list setting: an array from the editor's checkboxes, or a comma
 *  separated string (a text field, or the preview page's URL). */
const list = (v: unknown, fallback: string[]): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return fallback;
};

export function readConfig(raw: Record<string, unknown>): Config {
  const sources = [
    ...list(raw.atlantic, ['all']).map(atlanticSource),
    ...list(raw.ground, ['top']).map(groundSource),
    ...list(raw.groundTopics, []).map(groundTopicSource),
    ...list(raw.publishers, []).map(publisherSource),
  ].filter((s): s is Source => s !== null);

  return {
    sources: sources.filter((s, i) => sources.findIndex((o) => o.id === s.id) === i),
    rotateSeconds: num(raw.rotateSeconds, 20, 5, 600),
    photo: pick(raw.photo, ['auto', 'side', 'top', 'background', 'off'] as const, 'auto'),
    summarySentences: Math.round(num(raw.summarySentences, 2, 0, 6)),
    coverageBar: bool(raw.coverageBar, true),
    maxAgeHours: Math.round(num(raw.maxAgeHours, 72, 0, 168)),
    perFeed: Math.round(num(raw.perFeed, 10, 1, 50)),
    hideWords: list(raw.hideWords, []).map((w) => w.toLowerCase()),
    qr: bool(raw.qr, true),
    qrSize: pick(raw.qrSize, ['small', 'medium', 'large'] as const, 'medium'),
  };
}
