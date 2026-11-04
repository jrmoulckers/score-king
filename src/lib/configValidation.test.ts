import { describe, expect, it } from 'vitest';
import { configValidationMessage } from './configValidation';
import type { ConfigField } from './types';

const fields: ConfigField[] = [
  { key: 'count', label: 'Count', type: 'number', default: 1, min: 1, max: 3 },
  { key: 'fraction', label: 'Fraction', type: 'number', default: 0.5, min: 0.5, step: 0.5 },
];

describe('saved configuration numeric constraints', () => {
  it.each([0, 4, 1.5])('rejects invalid saved count %s', (count) => {
    expect(configValidationMessage(fields, { count, fraction: 0.5 })).toContain('Count:');
  });

  it.each([1, 3])('accepts valid boundary %s and explicit fractions', (count) => {
    expect(configValidationMessage(fields, { count, fraction: 1.5 })).toBeNull();
  });

  it('retains optional empty values', () => {
    expect(configValidationMessage(fields, { count: undefined, fraction: '' })).toBeNull();
  });

  it('rejects fractions not permitted by the explicit step', () => {
    expect(configValidationMessage(fields, { count: 1, fraction: 0.75 })).toContain('Fraction:');
  });

  it('checks collapsed advanced rules, not conditionally absent rules', () => {
    const conditional: ConfigField[] = [
      { ...fields[0], advanced: true, showIf: (config) => !!config.enabled },
    ];
    expect(configValidationMessage(conditional, { count: 0, enabled: false })).toBeNull();
    expect(configValidationMessage(conditional, { count: 0, enabled: true })).toContain('Count:');
  });
});
