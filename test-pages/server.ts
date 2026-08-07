/**
 * Static server for the extension's visual test pages.
 *
 * Usage: bun run testpages → http://localhost:4242
 *
 * Routes:
 * - GET /            auto-generated index of every scenario page, grouped by tab
 *                    folder (a page's <title> is its description — no bookkeeping)
 * - GET /robots.txt  per-scenario fixture chosen via the Referer header. The
 *                    popup's robots.txt fetch runs in the page context, so a
 *                    same-origin fetch from /robots/<scenario>.html carries that
 *                    page as referer: 'missing' → 404, 'server-error' → 500,
 *                    anything else → robots/fixtures/<scenario>.robots.txt.
 * - GET /status/<n>  responds with HTTP status <n>, for the Links status-check
 *                    fixtures. 3xx codes carry a Location (?to=… or /) so the
 *                    popup's redirect:'manual' probe sees a real redirect.
 * - everything else  static files from this directory
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4242);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

async function buildIndex(): Promise<string> {
  const dirs = (await readdir(ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .sort();

  const sections: string[] = [];
  for (const dir of dirs) {
    const files = (await readdir(path.join(ROOT, dir))).filter((file) => file.endsWith('.html')).sort();
    if (files.length === 0) continue;
    const items = await Promise.all(
      files.map(async (file) => {
        const html = await readFile(path.join(ROOT, dir, file), 'utf8');
        const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? file;
        return `<li><a href="/${dir}/${file}">${file.replace('.html', '')}</a><span>${title}</span></li>`;
      })
    );
    sections.push(`<section><div class="group">${dir}/</div><ul>${items.join('\n')}</ul></section>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Alfred test pages</title>
<style>
  body { font: 14px/1.6 system-ui, sans-serif; margin: 0 auto; max-width: 760px; padding: 32px 16px; background: #fafafa; color: #222; }
  .page-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .page-sub { color: #777; font-size: 13px; margin-bottom: 24px; }
  .group { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 700; color: #5c6ac4; margin: 20px 0 6px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; gap: 12px; padding: 3px 0; }
  li a { min-width: 160px; font-family: ui-monospace, monospace; font-size: 13px; }
  li span { color: #666; font-size: 13px; }
</style>
</head>
<body>
<div class="page-title">Alfred test pages</div>
<div class="page-sub">Open a scenario, then open the extension popup. Each page states the expected popup output. No heading tags are used in page chrome.</div>
${sections.join('\n')}
</body>
</html>`;
}

async function robotsResponse(referer: string | undefined): Promise<{ status: number; type: string; body: string }> {
  const scenario = referer?.match(/\/robots\/([\w-]+)\.html/)?.[1] ?? 'allow-all';
  const plain = 'text/plain; charset=utf-8';
  if (scenario === 'missing') return { status: 404, type: plain, body: 'Not Found' };
  if (scenario === 'server-error') return { status: 500, type: plain, body: 'Internal Server Error' };
  try {
    const body = await readFile(path.join(ROOT, 'robots', 'fixtures', `${scenario}.robots.txt`), 'utf8');
    return { status: 200, type: plain, body };
  } catch {
    return { status: 404, type: plain, body: `No fixture for scenario "${scenario}"` };
  }
}

async function sitemapResponse(referer: string | undefined): Promise<{ status: number; type: string; body: string }> {
  const scenario = referer?.match(/\/sitemaps\/([\w-]+)\.html/)?.[1] ?? 'index-shopify';
  if (scenario === 'missing') return { status: 404, type: 'text/plain', body: 'not found' };
  if (scenario === 'html-page') {
    return { status: 200, type: 'text/html', body: '<!doctype html><html><body>SPA fallback</body></html>' };
  }
  const body = await readFile(path.join(ROOT, 'sitemaps', 'fixtures', `${scenario}.xml`), 'utf8');
  return { status: 200, type: 'application/xml', body };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': MIME['.html']! });
      res.end(await buildIndex());
      return;
    }

    if (url.pathname === '/robots.txt') {
      const { status, type, body } = await robotsResponse(req.headers.referer);
      res.writeHead(status, { 'content-type': type });
      res.end(body);
      return;
    }

    if (url.pathname === '/sitemap.xml') {
      const { status, type, body } = await sitemapResponse(req.headers.referer);
      res.writeHead(status, { 'content-type': type });
      res.end(body);
      return;
    }

    const statusMatch = url.pathname.match(/^\/status\/(\d{3})$/);
    if (statusMatch) {
      const code = Number(statusMatch[1]);
      const headers: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8' };
      if (code >= 300 && code < 400) headers['location'] = url.searchParams.get('to') ?? '/';
      res.writeHead(code, headers);
      res.end(`status ${code}`);
      return;
    }

    const filePath = path.join(ROOT, path.normalize(url.pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Alfred test pages → http://localhost:${PORT}`);
});
