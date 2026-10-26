import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import manifest from '../manifest.json';

/** Stand-in for the host's plugin proxy (npm run preview only): the feeds
 *  don't allow browser requests, so the preview server fetches them, refusing
 *  any host the manifest doesn't allow, as the host does. */
function proxy(): Plugin {
  return {
    name: 'news-proxy',
    configureServer(server) {
      server.middlewares.use('/proxy', async (req, res) => {
        try {
          const { url, headers } = JSON.parse(new URL(req.url ?? '', 'http://x').searchParams.get('q') ?? '{}');
          const allowed = (u: string) => manifest.allowedDomains.includes(new URL(u).hostname);
          if (!allowed(url)) {
            res.statusCode = 403;
            res.end(`${url} is not in allowedDomains`);
            return;
          }
          const upstream = await fetch(url, { headers });
          if (!allowed(upstream.url)) {
            res.statusCode = 403;
            res.end(`redirected to ${upstream.url}, not in allowedDomains`);
            return;
          }
          res.statusCode = upstream.status;
          res.end(await upstream.text());
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  plugins: [proxy()],
  server: { port: 5181 },
});
