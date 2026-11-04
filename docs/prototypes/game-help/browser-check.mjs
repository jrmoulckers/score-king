import { chromium } from './tools.local/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPrototypeServer } from './serve.mjs';

const server = createPrototypeServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#guide[open]').waitFor();
    assert.equal(await page.locator('#footer-score').textContent(), '+40 pts');
    await page.getByRole('button', { name: 'Increase sample tricks won', exact: true }).click();
    assert.equal(await page.locator('#footer-score').textContent(), '−10 pts');
    await page.getByRole('button', { name: 'Increase sample bid', exact: true }).click();
    assert.equal(await page.locator('#footer-score').textContent(), '+60 pts');
    await page.locator('#round').selectOption('1');
    assert.equal(await page.locator('#footer-score').textContent(), '+20 pts');
    assert.equal(
      await page.getByRole('button', { name: 'Increase sample bid', exact: true }).isDisabled(),
      true,
    );
    await page.getByRole('button', { name: 'Try zero', exact: true }).click();
    assert.equal(await page.locator('#footer-score').textContent(), '+10 pts');
    await page.getByRole('button', { name: 'Increase sample tricks won', exact: true }).click();
    assert.equal(await page.locator('#footer-score').textContent(), '−10 pts');
    await page.locator('#round').selectOption('10');
    assert.equal(await page.locator('#footer-score').textContent(), '−100 pts');
    await page.getByRole('button', { name: 'Decrease sample tricks won', exact: true }).click();
    assert.equal(await page.locator('#footer-score').textContent(), '+100 pts');
    await page.getByRole('button', { name: 'Bounties & captures', exact: true }).click();
    assert.equal(await page.locator('#practice').isVisible(), false);
    assert.equal(await page.locator('#topic-copy tbody tr').count(), 5);
    await page.getByRole('button', { name: 'Table settings', exact: true }).click();
    await page.locator('#sample-bounty-setting').uncheck();
    assert.match(await page.locator('#setting-explanation').textContent(), /even when/);
    await page.getByRole('button', { name: 'Learn the game', exact: true }).click();
    assert.match(
      await page.locator('#topic-copy').textContent(),
      /not implemented in this prototype/i,
    );
    await page.getByRole('button', { name: 'Explore bid scoring', exact: false }).click();
    assert.equal(await page.locator('#practice').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('#guide').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'open-guide');
    await page.getByRole('button', { name: 'Open game guide', exact: true }).click();
    for (let index = 0; index < 30; index += 1) {
      await page.keyboard.press(index < 15 ? 'Tab' : 'Shift+Tab');
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('#guide').contains(document.activeElement),
        ),
        true,
      );
    }
    await page.getByRole('button', { name: 'At a glance', exact: false }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    const geometry = await page.locator('#guide').evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(geometry.width <= viewport.width + 1);
    assert.ok(geometry.scroll <= geometry.viewport + 1);
    if (viewport.width !== 320) {
      const size = viewport.width === 1440 ? 'desktop' : 'mobile';
      await page.locator('.guide-body').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({
        path: fileURLToPath(new URL(`tools.local/${size}.png`, import.meta.url)),
      });
      await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await page.screenshot({
        path: fileURLToPath(new URL(`tools.local/${size}-light.png`, import.meta.url)),
      });
    }
    await page.getByRole('button', { name: 'Back to the table', exact: true }).click();
    await page.locator('#guide').waitFor({ state: 'hidden' });
    await page.close();
    console.log(`PASS ${viewport.width}px: scoring, bounds, topics, keyboard, viewport fit`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
