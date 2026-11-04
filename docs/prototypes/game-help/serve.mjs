import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/prototype.css', ['prototype.css', 'text/css']],
  ['/prototype.js', ['prototype.js', 'text/javascript']],
  ['/app.css', ['../../../src/app.css', 'text/css']],
  ['/skullking-logic.js', ['../../../src/lib/games/skullking/logic.ts', 'text/javascript']],
  ['/prototype-util.js', ['../../../src/lib/util.ts', 'text/javascript']],
  ['/focus-trap.js', ['../../../src/lib/a11y/focusTrap.ts', 'text/javascript']],
]);

export function createPrototypeServer() {
  return createServer(async (request, response) => {
    const asset = assets.get(request.url);
    if (!asset || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      let source = await readFile(new URL(asset[0], import.meta.url), 'utf8');
      if (asset[0].endsWith('.ts')) {
        source = stripTypeScriptTypes(source);
        source = source.replace("from '../../util'", "from '/prototype-util.js'");
      }
      response.writeHead(200, {
        'Content-Type': `${asset[1]}; charset=utf-8`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      });
      response.end(request.method === 'HEAD' ? undefined : source);
    } catch (error) {
      console.error('Prototype asset could not be served:', error);
      response.writeHead(500).end('Prototype asset unavailable. See the server error.');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPrototypeServer();
  server.on('error', (error) => {
    console.error('Prototype server failed:', error);
    process.exitCode = 1;
  });
  server.listen(0, '127.0.0.1', () => {
    console.log(`Game-help prototype ready: http://127.0.0.1:${server.address().port}`);
  });
}
