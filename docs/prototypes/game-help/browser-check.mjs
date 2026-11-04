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
    assert.equal(await page.locator('#score').textContent(), '+40 points');
    await page.getByRole('button', { name: 'Trick 3', exact: true }).click();
    assert.equal(await page.locator('#score').textContent(), '−10 points');
    await page.getByLabel('Example bid', { exact: true }).selectOption('3');
    assert.equal(await page.locator('#score').textContent(), '+60 points');
    await page.getByRole('button', { name: 'Trick 1', exact: true }).click();
    assert.equal(await page.locator('#score').textContent(), '−10 points');
    assert.equal(
      await page.getByRole('button', { name: 'Trick 1', exact: true }).getAttribute('aria-pressed'),
      'false',
    );
    await page.getByRole('button', { name: 'Reset example', exact: true }).click();
    await page.locator('#round').selectOption('1');
    assert.equal(await page.locator('#score').textContent(), '+20 points');
    assert.equal(await page.locator('[data-trick]').count(), 1);
    assert.equal(await page.locator('#bid option').count(), 2);
    await page.getByRole('button', { name: 'Zero bids', exact: true }).click();
    assert.equal(await page.locator('#score').textContent(), '+10 points');
    await page.getByRole('button', { name: 'Trick 1', exact: true }).click();
    assert.equal(await page.locator('#score').textContent(), '−10 points');
    await page.locator('#round').selectOption('10');
    assert.equal(await page.locator('#score').textContent(), '−100 points');
    assert.equal(await page.locator('[data-trick]').count(), 10);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await page.locator('#score').textContent(), '+100 points');
    assert.equal(await page.getByRole('button', { name: 'Clear', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Bonuses', exact: true }).click();
    assert.equal(await page.locator('#practice').isVisible(), false);
    assert.equal(await page.locator('#topic-copy tbody tr').count(), 5);
    await page.getByRole('button', { name: 'Learn to play', exact: false }).click();
    assert.match(await page.locator('#topic-copy').textContent(), /full rules are not included/i);
    await page.getByRole('button', { name: 'Open scoring example', exact: false }).click();
    assert.equal(await page.locator('#practice').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('#guide').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'open-guide');
    await page.getByRole('button', { name: 'Rules & scoring', exact: true }).click();
    for (let index = 0; index < 30; index += 1) {
      await page.keyboard.press(index < 15 ? 'Tab' : 'Shift+Tab');
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('#guide').contains(document.activeElement),
        ),
        true,
      );
    }
    await page.getByRole('button', { name: 'Scoring', exact: true }).click();
    await page.getByRole('button', { name: 'Reset example', exact: true }).click();
    const geometry = await page.locator('#guide').evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(geometry.width <= viewport.width + 1);
    assert.ok(geometry.scroll <= geometry.viewport + 1);
    await page.locator('#practice').scrollIntoViewIfNeeded();
    const exampleGeometry = await page.evaluate(() => {
      const scroller = document.querySelector('.guide-scroll').getBoundingClientRect();
      const choices = document.querySelector('#trick-choices').getBoundingClientRect();
      const result = document.querySelector('.score-receipt').getBoundingClientRect();
      return {
        choicesVisible: choices.top >= scroller.top && choices.bottom <= scroller.bottom,
        resultVisible: result.top >= scroller.top && result.bottom <= scroller.bottom,
      };
    });
    assert.ok(exampleGeometry.choicesVisible, 'Won-trick controls must fit with the result');
    assert.ok(exampleGeometry.resultVisible, 'Result must be visible alongside won-trick controls');
    if (viewport.width !== 320) {
      const size = viewport.width === 1440 ? 'desktop' : 'mobile';
      await page.locator('.guide-scroll').evaluate((element) => {
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
    await page.getByRole('button', { name: 'Done', exact: true }).click();
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
