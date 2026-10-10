/**
 * Maps SethuCMS field types to form inputs and converts between what a form
 * control holds (strings / booleans) and the JSON value the API wants.
 * Demonstrates generating a form from `CollectionInfo.fields`.
 */
import type { CollectionInfo } from '@sethucms/sdk';

export type FieldInfo = CollectionInfo['fields'][number];

/** Which kind of control renders a field. Unknown types fall back to text. */
export type FieldKind =
  'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'datetime' | 'json';

/** What a form control holds. */
export type RawValue = string | boolean;

export function kindOf(type: string): FieldKind {
  switch (type) {
    case 'string':
      return 'text';
    case 'text':
      return 'textarea';
    case 'integer':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'json':
    case 'array':
    case 'geopoint':
      return 'json';
    default:
      return 'text'; // reference, binary, anything new
  }
}

/** The primary key field name (falls back to "id"). */
export function primaryKeyOf(fields: FieldInfo[]): string {
  return fields.find((f) => f.primaryKey)?.name ?? 'id';
}

/** Record value -> form control value. */
export function toRaw(field: FieldInfo, value: unknown): RawValue {
  const kind = kindOf(field.type);
  if (kind === 'boolean') {
    return value === true;
  }
  if (value === null || value === undefined) {
    return '';
  }
  switch (kind) {
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'date':
      return String(value).slice(0, 10);
    case 'datetime': {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) {
        return String(value);
      }
      // <input type="datetime-local"> wants local time without a zone.
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
      return local.toISOString().slice(0, 16);
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/**
 * Form control value -> JSON value for the API.
 * Returns `undefined` for "leave it out" (empty on create) and `null` for
 * "clear it" (empty on update). Throws Error with a readable message on bad
 * input; the form shows it next to the field.
 */
export function fromRaw(
  field: FieldInfo,
  raw: RawValue | undefined,
  mode: 'create' | 'update',
): unknown {
  const kind = kindOf(field.type);
  if (kind === 'boolean') {
    return raw === true;
  }
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') {
    return mode === 'update' ? null : undefined;
  }
  switch (kind) {
    case 'number': {
      const n = Number(text);
      if (!Number.isFinite(n)) {
        throw new Error(`${field.name}: "${text}" is not a number`);
      }
      if (field.type === 'integer' && !Number.isInteger(n)) {
        throw new Error(`${field.name}: must be a whole number`);
      }
      return n;
    }
    case 'json':
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`${field.name}: not valid JSON`);
      }
    case 'datetime':
      return new Date(text).toISOString();
    case 'date':
      return text;
    default:
      // References usually point at numeric ids; send those as numbers.
      if (field.type === 'reference' && /^-?\d+$/.test(text)) {
        return Number(text);
      }
      return typeof raw === 'string' ? raw : text; // keep inner spaces/newlines
  }
}

/** Short cell text for the table. */
export function display(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 80 ? text.slice(0, 77) + '...' : text;
}
