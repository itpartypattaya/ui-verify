// Headless run of the self-test for CI: serves the repository root, opens
// /test/ in Chrome and waits for window.__uiVerify. Exit code 1 on any failure.
//   npm install --no-save playwright-core
//   CHROME=/path/to/chrome node test/ci.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/test/`;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let code = 1;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.waitForFunction(() => window.__uiVerify?.done, null, { timeout: 180_000 });
  const r = await page.evaluate(() => window.__uiVerify);
  console.log(`ui-verify self-test: ${r.passed}/${r.total} passed`);
  for (const f of r.failures) console.log(`FAIL ${f.file} @${f.width}: ${f.title} — ${f.failed.join(', ')}`);
  code = r.passed === r.total ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
