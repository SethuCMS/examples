/**
 * Mapping between SethuCMS field types and form inputs.
 *
 * The gateway sends fields as `{ name, type, required, primaryKey, ... }`
 * (the SDK types only the first four; the rest are read through FieldInfo).
 */
import type { CollectionInfo, RecordData } from '@sethucms/sdk';

/** A field as the gateway really sends it: the SDK type plus a few extras. */
export type FieldInfo = CollectionInfo['fields'][number] & {
  editable?: boolean;
  generated?: boolean;
  masked?: boolean;
  validation?: {
    enum?: unknown[];
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
};

/** The kinds of input this UI can draw. Anything unknown is plain text. */
export type FieldKind =
  'string' | 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'json';

/** Pick the input kind for a canonical field type. */
export function fieldKind(type: string): FieldKind {
  switch (type) {
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
    case 'text':
      return 'text';
    default:
      return 'string';
  }
}

/** The collection's fields, typed with the extras. */
export function fieldsOf(collection: CollectionInfo): FieldInfo[] {
  return collection.fields as FieldInfo[];
}

/** The primary key field name, or undefined when the collection has none. */
export function primaryKeyOf(fields: FieldInfo[]): string | undefined {
  return fields.find((f) => f.primaryKey)?.name;
}

/** Whether a user may type into this field. Server flags win; falls back to "not generated". */
export function isEditable(field: FieldInfo): boolean {
  if (field.editable !== undefined) return field.editable;
  return !field.generated && !field.primaryKey;
}

/** Short text for a table cell. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Value to show in an `<input>` for the given kind. */
export function toInputValue(kind: FieldKind, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (kind === 'json') return JSON.stringify(value, null, 2);
  if (kind === 'date') return String(value).slice(0, 10);
  if (kind === 'datetime') return String(value).slice(0, 16);
  return String(value);
}

/**
 * Convert what the user typed back to a value for the API.
 * Returns `undefined` for "leave unset"; throws Error with a readable
 * message for text that cannot be parsed (bad JSON, not a number).
 */
export function fromInputValue(kind: FieldKind, raw: string): unknown {
  if (raw === '') return undefined;
  switch (kind) {
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`"${raw}" is not a number`);
      return n;
    }
    case 'json':
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new Error('Not valid JSON');
      }
    case 'datetime':
      return new Date(raw).toISOString();
    default:
      return raw;
  }
}

/** Parse a filter-box value according to the field kind. */
export function filterValue(
  kind: FieldKind,
  raw: string,
): string | number | boolean {
  if (kind === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`"${raw}" is not a number`);
    return n;
  }
  if (kind === 'boolean') return raw === 'true';
  return raw;
}

/** Copy a record, keeping only keys that exist as fields (used for editing). */
export function pick(record: RecordData, names: string[]): RecordData {
  return Object.fromEntries(
    names.filter((n) => n in record).map((n) => [n, record[n]]),
  );
}
