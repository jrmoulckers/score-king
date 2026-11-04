import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const source = readFileSync(resolve('src', 'app.css'), 'utf8');

afterEach(() => {
  document.head.querySelector('#button-target-styles')?.remove();
  document.body.replaceChildren();
});

describe('shared compact button targets', () => {
  it.each(['btn small', 'btn small ghost', 'btn small primary', 'btn small danger'])(
    '%s retains the shared 46px minimum with compact text and padding',
    (classes) => {
      const style = document.createElement('style');
      style.id = 'button-target-styles';
      style.textContent = ['.btn', '.btn.small']
        .map((selector) => {
          const rule = source.match(
            new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{[^}]*\\}`),
          )?.[0];
          expect(rule).toBeDefined();
          return rule;
        })
        .join('\n');
      document.head.appendChild(style);

      for (const tag of ['button', 'a']) {
        const control = document.createElement(tag);
        control.className = classes;
        control.textContent = 'Bounty guide';
        document.body.appendChild(control);

        const computed = getComputedStyle(control);
        expect(computed.minHeight).toBe('46px');
        expect(computed.padding).toBe('7px 12px');
        expect(computed.fontSize).toBe('0.9rem');
      }
    },
  );

  it('does not replace the minimum with a fixed height that clips wrapped labels', () => {
    const compactRule = source.match(/\.btn\.small\s*\{([^}]*)\}/)?.[1];
    expect(compactRule).toBeDefined();
    expect(compactRule).not.toMatch(/(?:^|;)\s*(?:height|max-height)\s*:/);
  });
});
