/**
 * Demonstrates generating an edit form from the collection's field list:
 * maps gateway field types to input kinds and converts form text back into
 * JSON values for create/update.
 */

export type FieldKind =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'other';

/** Field as described by the gateway (subset used here). */
export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  primaryKey: boolean;
}

/** Map a canonical gateway type to the kind of input we render. */
export function kindOf(type: string): FieldKind {
  switch (type) {
    case 'string':
      return 'string';
    case 'text':
      return 'text';
    case 'integer':
    case 'decimal':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'json':
    case 'array':
      return 'json';
    default:
      return 'other'; // reference, binary, geopoint, unknown: plain text
  }
}

/** The primary key field name (first flagged field, else "id"). */
export function primaryKeyOf(fields: FieldInfo[]): string {
  return fields.find((f) => f.primaryKey)?.name ?? 'id';
}

/** Turn a stored value into the text shown in an input. */
export function toInputText(kind: FieldKind, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (kind === 'boolean') return value ? 'on' : '';
  if (kind === 'json') return JSON.stringify(value, null, 2);
  if (kind === 'date') return String(value).slice(0, 10);
  if (kind === 'datetime') return String(value).slice(0, 16);
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Short text for a table cell. */
export function toCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** A field's text could not be turned into a value. */
export class FieldParseError extends Error {
  override name = 'FieldParseError';
}

/**
 * Convert the raw text of one input into a JSON value.
 * Returns `undefined` for "leave this field out of the request".
 */
export function parseInput(
  field: FieldInfo,
  raw: string,
  mode: 'create' | 'update',
): unknown {
  const kind = kindOf(field.type);
  if (kind === 'boolean') return raw === 'on';
  if (raw.trim() === '') {
    if (mode === 'create') {
      // Required text is still sent (as ""), so the gateway explains the problem.
      return field.required && (kind === 'string' || kind === 'text')
        ? ''
        : undefined;
    }
    if (field.required)
      return kind === 'string' || kind === 'text' ? '' : undefined;
    return null; // clearing an optional field
  }
  switch (kind) {
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new FieldParseError(`"${field.name}" must be a number`);
      }
      return n;
    }
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        throw new FieldParseError(`"${field.name}" is not valid JSON`);
      }
    case 'datetime': {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        throw new FieldParseError(
          `"${field.name}" is not a valid date and time`,
        );
      }
      return d.toISOString();
    }
    default:
      return raw;
  }
}
