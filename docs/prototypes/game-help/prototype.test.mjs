import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrototypeServer } from './serve.mjs';

test('isolated preview serves assets and the real scorer, never arbitrary repository files', async () => {
  const server = createPrototypeServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'none'/);
    const html = await page.text();
    assert.match(html, /<dialog id="guide" aria-labelledby="guide-title">/);
    assert.match(html, /Practice only/);
    assert.match(html, /not a complete rulebook/);
    for (const asset of [
      '/app.css',
      '/prototype.css',
      '/prototype.js',
      '/prototype-util.js',
      '/focus-trap.js',
    ]) {
      const response = await fetch(base + asset);
      assert.equal(response.status, 200, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    for (const path of ['/AGENTS.md', '/.env', '/src/lib/types.ts', '/..%2f..%2fpackage.json']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 404);
    const asModule = (source) =>
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const util = await (await fetch(base + '/prototype-util.js')).text();
    const logic = await (await fetch(base + '/skullking-logic.js')).text();
    const { scoreRow, BONUS_VALUES } = await import(
      asModule(logic.replace('/prototype-util.js', asModule(util)))
    );
    for (let round = 1; round <= 10; round += 1) {
      for (let bid = 0; bid <= round; bid += 1) {
        for (let actual = 0; actual <= round; actual += 1) {
          const expected =
            bid === 0
              ? (actual === 0 ? 10 : -10) * round
              : bid === actual
                ? 20 * bid
                : -10 * Math.abs(actual - bid);
          assert.equal(scoreRow({ bid, actual, bonus: 0 }, round, true), expected);
        }
      }
    }
    assert.equal(scoreRow({ bid: 2, actual: 2, bonus: BONUS_VALUES.pirate }, 5, true), 70);
    assert.equal(scoreRow({ bid: 2, actual: 3, bonus: BONUS_VALUES.pirate }, 5, true), -10);
    assert.equal(scoreRow({ bid: 2, actual: 3, bonus: BONUS_VALUES.pirate }, 5, false), 20);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
