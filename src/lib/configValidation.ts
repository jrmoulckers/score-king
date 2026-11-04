import type { ConfigField } from './types';

/** Recheck saved rules when creating a rematch without editable configuration controls. */
export function configValidationMessage(
  fields: ConfigField[] | undefined,
  config: Record<string, unknown>,
): string | null {
  for (const field of fields ?? []) {
    if (field.type !== 'number' || (field.showIf && !field.showIf(config))) continue;
    const input = document.createElement('input');
    input.type = 'number';
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    input.step = String(field.step ?? 1);
    input.value = config[field.key] == null ? '' : String(config[field.key]);
    if (!input.validity.valid) return `${field.label}: ${input.validationMessage}`;
  }
  return null;
}
