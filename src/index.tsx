import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { hostFrameStyle } from './host-style';
import { readConfig } from './config';
import type { Config, PhotoFit } from './config';
import type { Coverage, StoryImage } from './feed';
import { useFitFontSize } from './fit';
import { arrange, photoSize, qrPixels } from './layout';
import type { Arrangement } from './layout';
import { ageLabel, hostFetcher, mix, PLUGIN_ID, refreshDue, sourceState } from './news';
import type { Fetcher, ShownStory } from './news';
import { qrFor } from './qr';
import type { Source } from './sources';
import { firstSentences } from './text';

/** How often to check whether a feed is due another look. */
const CHECK_MS = 60_000;
/** Text grows up to this many times the module's Text size to fill the box. */
const MAX_GROW = 4;
/** A summary is cut short rather than letting the story's text fall below
 *  this many times the module's Text size: from across the room a big
 *  headline alone beats a small headline and paragraph. */
const MIN_WITH_SUMMARY = 1.5;
const FADE_MS = 800;

/** Ground News's own coverage colors, lifted to read on a dark module. */
const BIAS = { left: '#3f7fe8', center: '#ece6d6', right: '#e5483b' };

const KEYFRAMES = `@keyframes nf-fade { from { opacity: 0; } to { opacity: 1; } }`;

function log(level: 'info' | 'warn' | 'error', message: string) {
  try {
    window.__HS_SDK__?.emit?.({ type: 'log', level, message: `[${PLUGIN_ID}] ${message}` });
  } catch { /* logging is best effort */ }
}

// ── Stories ─────────────────────────────────────────────────────────────────

interface News {
  stories: ShownStory[];
  /** Every source has answered at least once (or failed). */
  settled: boolean;
  /** Sources that failed last time and have nothing to show. */
  failed: Source[];
}

function useNews(fetcher: Fetcher, cfg: Config): News {
  const [, setTick] = useState(0);
  const key = cfg.sources.map((s) => s.url).join('|');

  useEffect(() => {
    let alive = true;
    const done = () => { if (alive) setTick((t) => t + 1); };
    const check = () => refreshDue(fetcher, cfg.sources, log, done);
    check();
    // A load another module started before this one mounted.
    for (const s of cfg.sources) sourceState(s.url).loading?.then(done);
    const timer = setInterval(check, CHECK_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, key]);

  const states = cfg.sources.map((source) => ({ source, state: sourceState(source.url) }));
  return {
    stories: mix(states.map(({ source, state }) => ({ source, stories: state.stories ?? [] })), cfg),
    settled: states.every(({ state }) => state.stories !== null || state.failure !== null),
    failed: states.filter(({ state }) => state.failure && !state.stories).map(({ source }) => source),
  };
}

// ── Timer ───────────────────────────────────────────────────────────────────

/** A counter that goes up every `seconds`, counted from the wall clock so
 *  it carries on where it was when a screen rotates back. */
function useStep(seconds: number): number {
  const ms = seconds * 1000;
  const [step, setStep] = useState(() => Math.floor(Date.now() / ms));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = Date.now();
      setStep(Math.floor(now / ms));
      timer = setTimeout(arm, ms - (now % ms) + 20);
    };
    arm();
    return () => clearTimeout(timer);
  }, [ms]);
  return step;
}

// ── Box size ────────────────────────────────────────────────────────────────

function useBoxSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Layout size, not on-screen size: the editor scales the canvas down
      // with a transform, and the layout must match the module's real shape.
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function QrCode({ url, px }: { url: string; px: number }) {
  const qr = useMemo(() => qrFor(url), [url]);
  return (
    <div
      style={{
        width: px,
        height: px,
        background: '#fff',
        borderRadius: Math.round(px * 0.06),
        padding: Math.round(px * 0.04),
        boxSizing: 'border-box',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.45)',
      }}
    >
      <svg viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} width="100%" height="100%" shapeRendering="crispEdges" role="img" aria-label={`QR code: ${url}`}>
        <path d={qr.path} fill="#000" />
      </svg>
    </div>
  );
}

/** Pictures that wouldn't load, so a story that comes back round goes
 *  straight to its text-only layout. */
const brokenImages = new Set<string>();
/** Each photo's shape (width / height), learned when it loads, so its frame
 *  fits it, and fits at once when the story comes back round. */
const photoRatios = new Map<string, number>();
/** Until a photo has loaded: the usual shape of a news photo. */
const DEFAULT_RATIO = 1.6;

const fill: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };

/** The story's photo in its frame. Whole: all of the photo, any space it
 *  leaves filled with a blurred, darkened copy of it rather than bars. Fill:
 *  cropped to the frame. Falls back to the feed's own URL if the resized one
 *  fails, and tells the panel the photo's shape, or that neither loads. */
function Photo({ image, fit, align, style, onRatio, onBroken }: {
  image: StoryImage;
  fit: PhotoFit;
  /** Where a whole photo sits when the frame is larger than it. */
  align?: string;
  style: CSSProperties;
  onRatio: (ratio: number) => void;
  onBroken: () => void;
}) {
  const [src, setSrc] = useState(image.src);
  useEffect(() => setSrc(image.src), [image.src]);
  const whole = fit === 'whole';
  return (
    <div style={{ position: 'relative', overflow: 'hidden', ...style }}>
      {whole && (
        <img
          src={src}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          style={{ ...fill, objectFit: 'cover', filter: 'blur(24px) brightness(0.5)', transform: 'scale(1.15)' }}
        />
      )}
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onLoad={(e) => {
          const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget;
          if (nw > 0 && nh > 0) onRatio(nw / nh);
        }}
        onError={() => {
          if (image.fallback && src !== image.fallback) setSrc(image.fallback);
          else { brokenImages.add(image.src); onBroken(); }
        }}
        style={{ ...fill, objectFit: whole ? 'contain' : 'cover', objectPosition: whole ? (align ?? 'center') : 'center 30%' }}
      />
    </div>
  );
}

function SourceLine({ story }: { story: ShownStory }) {
  const age = ageLabel(story.time);
  const count = story.coverage?.sources;
  const parts = [age, count ? `${count} sources` : ''].filter(Boolean);
  return (
    <div
      style={{
        flex: 'none',
        fontSize: '0.85em',
        fontWeight: 800,
        letterSpacing: '0.04em',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span style={{ color: story.source.accent, textTransform: 'uppercase' }}>{story.source.label}</span>
      {parts.length > 0 && <span style={{ opacity: 0.8 }}>{` · ${parts.join(' · ')}`}</span>}
    </div>
  );
}

/** Ground News's Left / Center / Right split of the outlets covering a
 *  story, with each share written in its segment when there's room. */
function CoverageBar({ c }: { c: Coverage }) {
  const total = c.left + c.center + c.right;
  const segs = ([['left', 'L', c.left], ['center', 'C', c.center], ['right', 'R', c.right]] as const)
    .filter(([, , v]) => v > 0);
  return (
    <div style={{ display: 'flow-root', margin: '0.35em 0 0.45em' }}>
      {c.blindspotFor && (
        <div style={{ fontSize: '0.85em', fontWeight: 800, color: '#ffd166', marginBottom: '0.2em', lineHeight: 1.2 }}>
          Blindspot: little coverage from the {c.blindspotFor === 'left' ? 'Left' : 'Right'}
        </div>
      )}
      <div style={{ display: 'flex', height: '1.35em', borderRadius: '0.3em', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)' }}>
        {segs.map(([side, letter, v]) => (
          <div
            key={side}
            style={{
              flex: `${v / total} 1 0`,
              minWidth: 0,
              background: BIAS[side],
              color: side === 'center' ? '#111' : '#fff',
              textShadow: 'none',
              fontSize: '0.85em',
              fontWeight: 800,
              lineHeight: '1.59em',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {/* Under about an eighth of the bar, a label doesn't fit. */}
            {v / total >= 0.13 ? `${letter} ${Math.round(v)}%` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── A story ─────────────────────────────────────────────────────────────────

/** Padding inside the panel: a share of its short side, in pixels. */
const panelPad = (w: number, h: number) => Math.round(Math.max(10, Math.min(36, Math.min(w, h) * 0.045)));

interface StoryProps {
  story: ShownStory;
  cfg: Config;
  w: number;
  h: number;
  baseFont: number;
}

/** The source and age, the headline as large as the space allows, Ground
 *  News's coverage bar, the summary, and the QR code in the bottom-right
 *  corner with the text flowing around it.
 *
 *  A long summary would shrink everything, so when the story only fits below
 *  MIN_WITH_SUMMARY, the summary loses a sentence at a time, down to the
 *  headline alone if need be. */
function StoryText({ story, cfg, w, h, baseFont, overlay }: StoryProps & { overlay?: boolean }) {
  const pad = panelPad(w, h);
  const qrPx = cfg.qr ? qrPixels(w - pad * 2, h - pad * 2, cfg.qrSize) : 0;
  const coverage = cfg.coverageBar ? story.coverage : null;

  const cutKey = `${story.id}|${cfg.summarySentences}|${w}x${h}`;
  const [cut, setCut] = useState({ key: cutKey, n: cfg.summarySentences });
  const n = cut.key === cutKey ? cut.n : cfg.summarySentences;
  const summary = n > 0 && story.summary ? firstSentences(story.summary, n) : '';

  const desired = Math.min(baseFont * MAX_GROW, Math.max(baseFont, h / 4));
  const { boxRef, fontSize, settled } = useFitFontSize(desired, `${story.id}|${qrPx}|${n}|${coverage ? 1 : 0}`);

  useEffect(() => {
    if (!settled || !summary || fontSize >= baseFont * MIN_WITH_SUMMARY) return;
    // Down to the next count that actually shortens the text.
    let next = n - 1;
    while (next > 0 && firstSentences(story.summary, next) === summary) next -= 1;
    setCut({ key: cutKey, n: next });
  }, [settled, summary, fontSize, baseFont, n, cutKey, story.summary]);

  return (
    <div
      ref={boxRef}
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: pad,
        overflow: 'hidden',
        fontSize,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3em',
      }}
    >
      {/* Bottom-aligns the text over a photo; unlike justify-content, it lets
          an overlong story overflow downward, where the fit can measure it. */}
      {overlay && <div style={{ flex: '1 1 0', minHeight: 0 }} />}
      <SourceLine story={story} />
      <div data-fit style={{ flex: overlay ? 'none' : '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        {qrPx > 0 && !overlay && (
          <>
            {/* A zero-width spacer pushes the code down to the bottom corner,
                so the text uses the full width above it. */}
            <div style={{ float: 'right', width: 0, height: `calc(100% - ${qrPx + 1}px)` }} />
            <div style={{ float: 'right', clear: 'right', marginLeft: '0.5em', lineHeight: 0 }}>
              <QrCode url={story.url} px={qrPx} />
            </div>
          </>
        )}
        <div style={{ fontSize: '1.55em', fontWeight: 800, lineHeight: 1.12 }}>{story.title}</div>
        {coverage && <CoverageBar c={coverage} />}
        {summary && <div style={{ lineHeight: 1.3, fontWeight: 500, marginTop: coverage ? 0 : '0.35em', opacity: 0.92 }}>{summary}</div>}
      </div>
    </div>
  );
}

function StoryPanel(props: StoryProps) {
  const { story, cfg, w, h } = props;
  const [broken, setBroken] = useState(() => !!story.image && brokenImages.has(story.image.src));
  const image = broken ? null : story.image;
  const [ratio, setRatio] = useState(() => (story.image && photoRatios.get(story.image.src)) || DEFAULT_RATIO);
  const a: Arrangement = arrange(cfg.photo, w, h, !!image, ratio);
  const photo = photoSize(a, w, h, ratio);
  const markBroken = () => setBroken(true);
  const learnRatio = (r: number) => {
    if (story.image) photoRatios.set(story.image.src, r);
    if (Math.abs(r - ratio) > 0.01) setRatio(r);
  };

  if (a === 'background' && image) {
    const pad = panelPad(w, h);
    const qrPx = cfg.qr ? qrPixels(w - pad * 2, h - pad * 2, cfg.qrSize) : 0;
    const textH = Math.round(h * 0.64);
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        {/* A whole photo sits at the top, clear of the text over the bottom. */}
        <Photo image={image} fit={cfg.photoFit} align="center top" onRatio={learnRatio} onBroken={markBroken} style={fill} />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: textH,
            paddingRight: qrPx ? qrPx + pad : 0,
            boxSizing: 'border-box',
            color: '#fff',
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
            background: 'linear-gradient(to top, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.7) 65%, rgba(0, 0, 0, 0))',
          }}
        >
          <StoryText {...props} w={w - (qrPx ? qrPx + pad : 0)} h={textH} overlay />
        </div>
        {qrPx > 0 && (
          <div style={{ position: 'absolute', right: pad, bottom: pad }}>
            <QrCode url={story.url} px={qrPx} />
          </div>
        )}
      </div>
    );
  }

  if ((a === 'side' || a === 'top') && image) {
    const side = a === 'side';
    const rest = side ? { w: w - photo.w, h } : { w, h: h - photo.h };
    return (
      <div style={{ display: 'flex', flexDirection: side ? 'row' : 'column', width: '100%', height: '100%' }}>
        <Photo image={image} fit={cfg.photoFit} onRatio={learnRatio} onBroken={markBroken} style={{ flex: 'none', width: photo.w, height: photo.h }} />
        <div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0 }}>
          <StoryText {...props} w={rest.w} h={rest.h} />
        </div>
      </div>
    );
  }

  return <StoryText {...props} />;
}

/** A panel that measures the box it's given. */
function Slide({ style, ...props }: Omit<StoryProps, 'w' | 'h'> & { style?: CSSProperties }) {
  const [ref, box] = useBoxSize();
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }}>
      {box.w > 0 && box.h > 0 && <StoryPanel {...props} w={box.w} h={box.h} />}
    </div>
  );
}

/** One story at a time, crossfading on the timer. The next story is mounted
 *  ahead, invisible, so its photo has loaded and its text has settled at its
 *  size before it fades in. */
function InTurn({ stories, cfg, step, baseFont }: { stories: ShownStory[]; cfg: Config; step: number; baseFont: number }) {
  const [leaving, setLeaving] = useState<number | null>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    setLeaving(shown.current);
    shown.current = step;
    const t = setTimeout(() => setLeaving(null), FADE_MS + 100);
    return () => clearTimeout(t);
  }, [step]);

  const n = stories.length;
  const at = (s: number) => stories[((s % n) + n) % n];
  const slides = n > 1
    ? [leaving, step, step + 1].filter((s): s is number => s !== null)
    : [step];

  return (
    <>
      {slides.map((s) => {
        const role = s === step ? 'current' : s === leaving ? 'leaving' : 'next';
        const story = at(s);
        return (
          <Slide
            key={n > 1 ? `${s}|${story.id}` : 'only'}
            story={story}
            cfg={cfg}
            baseFont={baseFont}
            style={{
              opacity: role === 'next' ? 0 : 1,
              zIndex: role === 'current' ? 2 : role === 'leaving' ? 1 : 0,
              transition: role === 'current' ? `opacity ${FADE_MS}ms ease-in-out` : undefined,
              pointerEvents: role === 'current' ? undefined : 'none',
            }}
          />
        );
      })}
    </>
  );
}

// ── Notices ─────────────────────────────────────────────────────────────────

function Notice({ title, detail, delayed }: { title: string; detail?: string; delayed?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '1em',
        gap: '0.4em',
        // Only shown if the wait is noticeable, so a quick load doesn't flash it.
        animation: delayed ? 'nf-fade 400ms ease-out 2s both' : undefined,
      }}
    >
      <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{title}</div>
      {detail && <div style={{ fontSize: '1em', opacity: 0.8, maxWidth: '32em' }}>{detail}</div>}
    </div>
  );
}

const names = (sources: Source[]) => {
  const labels = [...new Set(sources.map((s) => s.label.split(' · ')[0]))];
  return labels.length <= 2 ? labels.join(' or ') : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
};

// ── Module ──────────────────────────────────────────────────────────────────

/** `fetcher` and `stepOffset` are for the preview page: a stand-in for the
 *  host proxy, and a way to show a story other than the current one. */
export default function NewsFeed(props: PluginComponentProps & { fetcher?: Fetcher; stepOffset?: number }) {
  const { style } = props;
  const cfg = useMemo(() => readConfig(props.config ?? {}), [props.config]);
  const fetcher = useMemo(() => props.fetcher ?? hostFetcher(), [props.fetcher]);
  const news = useNews(fetcher, cfg);
  const step = useStep(cfg.rotateSeconds) + (props.stepOffset ?? 0);
  const [boxRef, box] = useBoxSize();
  const baseFont = Number.isFinite(style.fontSize) && style.fontSize > 0 ? style.fontSize : 18;

  let notice: { title: string; detail?: string; delayed?: boolean } | null = null;
  if (cfg.sources.length === 0) notice = { title: 'No news sources chosen', detail: "Pick at least one in this module's settings." };
  else if (news.stories.length === 0 && !news.settled) notice = { title: 'Loading the news…', delayed: true };
  else if (news.stories.length === 0 && news.failed.length === cfg.sources.length) notice = { title: `Can't reach ${names(news.failed)}`, detail: 'Trying again shortly.' };
  else if (news.stories.length === 0) {
    notice = {
      title: 'No stories right now',
      detail: cfg.maxAgeHours > 0 ? `Nothing newer than ${cfg.maxAgeHours} hours from these sources. Checking again shortly.` : 'Checking again shortly.',
    };
  }

  const radius = Math.max(0, (Number(style.borderRadius) || 0) - (Number(style.padding) || 0));

  return (
    <div style={{ ...hostFrameStyle(style, { baseFontSize: 18 }), textShadow: '0 1px 3px rgba(0, 0, 0, 0.55)' }}>
      <style>{KEYFRAMES}</style>
      <div ref={boxRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: radius }}>
        {!notice && box.w > 0 && <InTurn stories={news.stories} cfg={cfg} step={step} baseFont={baseFont} />}
        {notice && <Notice {...notice} />}
      </div>
    </div>
  );
}
