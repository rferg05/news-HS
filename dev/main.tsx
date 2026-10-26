import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import manifest from '../manifest.json';
import NewsFeed from '../src/index';
import type { Fetcher } from '../src/news';
import { makeHostDisplayCache } from './host-cache';

// Stand-in for the host: just enough SDK for the module to run.
(window as unknown as { React: typeof React }).React = React;
(window as unknown as { __HS_SDK__: unknown }).__HS_SDK__ = {
  displayCache: makeHostDisplayCache(),
  emit: (e: unknown) => console.info('[host emit]', e),
};

// The real module goes through the host proxy; here, through the preview
// server's stand-in for it (dev/vite.config.ts).
const devFetcher: Fetcher = async (req) => {
  const res = await fetch(`/proxy?q=${encodeURIComponent(JSON.stringify({ url: req.url, headers: req.headers }))}`);
  return { status: res.status, body: await res.text() };
};

const params = new URLSearchParams(location.search);
const style = {
  fontSize: Number(params.get('fs') ?? manifest.defaultStyle.fontSize), fontFamily: 'inter', textColor: '#ffffff',
  backgroundColor: manifest.defaultStyle.backgroundColor, borderRadius: manifest.defaultStyle.borderRadius,
  padding: manifest.defaultStyle.padding, opacity: 1, backdropBlur: 0,
};
const config: Record<string, unknown> = {
  ...manifest.defaultConfig,
  rotateSeconds: 10,
  ...Object.fromEntries([...params].filter(([k]) => !['w', 'h', 'fs', 'zoom', 'gallery'].includes(k))),
};
// ?zoom=0.5 shows a full-screen-sized module scaled down, as the editor does.
const zoom = Number(params.get('zoom') ?? 1);

/** The module at a size you can change, to check the layout refits live. */
function Harness() {
  const [w, setW] = useState(Number(params.get('w') ?? manifest.defaultSize.w));
  const [h, setH] = useState(Number(params.get('h') ?? manifest.defaultSize.h));
  useEffect(() => {
    (window as unknown as { setBox: unknown }).setBox = (nw: number, nh: number) => { setW(nw); setH(nh); };
  }, []);
  const btn = { font: 'inherit', padding: '4px 10px', borderRadius: 6, border: '1px solid #fff4', background: '#0006', color: '#fff', cursor: 'pointer' };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, color: '#fff', fontSize: 13, alignItems: 'center', flexWrap: 'wrap' }}>
        {[[960, 540], [1920, 1080], [540, 960], [600, 600], [1800, 360], [480, 300]].map(([bw, bh]) => (
          <button key={`${bw}x${bh}`} style={btn} onClick={() => { setW(bw); setH(bh); }}>{bw}×{bh}</button>
        ))}
        <span>{w}×{h} · add ?photo=background, ?ground=blindspot, ?publishers=bbc,npr, ?zoom=0.5… to the URL</span>
      </div>
      <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
        <div id="module" style={{ width: w, height: h, resize: 'both', overflow: 'hidden' }}>
          <NewsFeed config={config} style={style} fetcher={devFetcher} />
        </div>
      </div>
    </div>
  );
}

/** ?gallery=12: that many stories side by side at the chosen size, to check
 *  every one fits (see `fitReport()` in the console). */
function Gallery({ count }: { count: number }) {
  const w = Number(params.get('w') ?? manifest.defaultSize.w);
  const h = Number(params.get('h') ?? manifest.defaultSize.h);
  return (
    <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', display: 'flex', flexWrap: 'wrap', gap: 12, width: (w + 12) * Math.max(1, Math.floor(1260 / zoom / (w + 12))) }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="module" style={{ width: w, height: h }}>
          <NewsFeed config={{ ...config, rotateSeconds: 3600 }} style={style} fetcher={devFetcher} stepOffset={i} />
        </div>
      ))}
    </div>
  );
}

/** Each module's text size and any overflow of its text regions. */
(window as unknown as { fitReport: unknown }).fitReport = () => [...document.querySelectorAll('.module, #module')].map((m) => {
  // The showing story's slide sits on top (z-index 2); a lone story has none.
  const slide = m.querySelector<HTMLElement>('[style*="z-index: 2"] [data-fit]') ?? m.querySelector<HTMLElement>('[data-fit]');
  if (!slide) return { text: (m as HTMLElement).innerText.slice(0, 40) };
  const box = slide.parentElement!;
  const over = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  return { fs: Math.round(parseFloat(getComputedStyle(box).fontSize)), overflow: over(box) || over(slide), title: slide.innerText.split('\n')[0].slice(0, 40) };
});

const gallery = Number(params.get('gallery') ?? 0);
createRoot(document.getElementById('root')!).render(gallery > 0 ? <Gallery count={gallery} /> : <Harness />);
