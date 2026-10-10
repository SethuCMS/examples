import { useEffect, useState, type FormEvent } from 'react';
import type {
  CollectionInfo,
  ConnectionInfo,
  RecordData,
  SethuClient,
} from '@sethucms/sdk';
import {
  fieldKind,
  fieldsOf,
  fromInputValue,
  isEditable,
  primaryKeyOf,
  toInputValue,
  type FieldInfo,
} from '../lib/fields';
import type { Access } from '../lib/describe';
import { ErrorBanner } from './ErrorBanner';

/**
 * Create / edit / delete form, generated from the collection's field list.
 * Demonstrates `collection.create`, `.update` (PATCH) and `.delete`, and how
 * a SethuApiError (code + message) surfaces from a rejected write, for example
 * VALIDATION_FAILED for a bad slug. Writes are disabled on read_only
 * connections. `record === null` means "new record".
 */
export function RecordForm(props: {
  cms: SethuClient;
  connection: ConnectionInfo;
  collection: CollectionInfo;
  record: RecordData | null;
  /** What the server says this caller may do (undefined until loaded). */
  access: Access | undefined;
  onChanged(): void;
  onReset(): void;
}) {
  const { cms, connection, collection, record, access, onChanged, onReset } =
    props;
  const fields = fieldsOf(collection);
  const pk = primaryKeyOf(fields);
  const editing = record !== null;
  const readOnly = connection.mode === 'read_only';
  const denied =
    !readOnly &&
    access !== undefined &&
    !(editing ? access.update : access.create);
  const cannotDelete = readOnly || (access !== undefined && !access.delete);

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load the chosen record (or blank values) into the form.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of fields)
      next[f.name] = toInputValue(fieldKind(f.type), record?.[f.name]);
    setValues(next);
    setError(undefined);
    setMessage('');
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, collection.name, connection.id]);

  const handle = cms.collection(connection.id, collection.name);
  const id = record && pk ? String(record[pk]) : '';

  // Turn the typed text into an API payload; throws a plain Error for unparseable input.
  const payload = (): RecordData => {
    const out: RecordData = {};
    for (const f of fields) {
      if (!isEditable(f)) continue;
      const raw = values[f.name] ?? '';
      const kind = fieldKind(f.type);
      const parsed =
        kind === 'boolean'
          ? raw === ''
            ? undefined
            : raw === 'true'
          : parseField(f, raw);
      if (parsed !== undefined) out[f.name] = parsed;
      else if (editing && toInputValue(kind, record?.[f.name]) !== '')
        out[f.name] = null; // cleared
    }
    return out;
  };

  const run = async (action: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setMessage('');
    try {
      setMessage(await action());
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      const body = payload();
      if (editing) {
        await handle.update(id, body);
        return `Updated ${pk}=${id}`;
      }
      const created = await handle.create(body);
      onReset();
      return `Created ${pk ?? 'record'}=${String(pk ? created[pk] : '')}`;
    });
  };

  const remove = (): void => {
    void run(async () => {
      await handle.delete(id);
      onReset();
      return `Deleted ${pk}=${id}`;
    });
  };

  return (
    <section className="panel">
      <h2>{editing ? `Edit record ${id}` : 'New record'}</h2>
      {readOnly && (
        <div className="notice" data-testid="readonly-note">
          This connection is read_only, so writes are disabled.
        </div>
      )}
      {denied && (
        <div className="notice" data-testid="denied-note">
          Your token may not {editing ? 'update' : 'create'} records in this
          collection.
        </div>
      )}
      <form onSubmit={submit} data-testid="record-form">
        <fieldset disabled={readOnly || denied || busy}>
          {fields.map((f) => (
            <FieldInput
              key={f.name}
              field={f}
              value={values[f.name] ?? ''}
              onChange={(v) => setValues({ ...values, [f.name]: v })}
            />
          ))}
          <div className="row">
            <button type="submit" className="primary" data-testid="save">
              {editing ? 'Save changes' : 'Create'}
            </button>
            {editing && (
              <>
                <button type="button" onClick={onReset} data-testid="new">
                  New record
                </button>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setConfirmDelete(true)}
                    data-testid="delete"
                  >
                    Delete
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="danger"
                      onClick={remove}
                      data-testid="confirm-delete"
                    >
                      Really delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </fieldset>
      </form>
      {message && (
        <div className="success" data-testid="form-message">
          {message}
        </div>
      )}
      <ErrorBanner error={error} />
    </section>
  );
}

// Parse one text value; a parse problem becomes an Error the banner can show.
function parseField(field: FieldInfo, raw: string): unknown {
  try {
    return fromInputValue(fieldKind(field.type), raw);
  } catch (e) {
    throw new Error(`${field.name}: ${(e as Error).message}`);
  }
}

/** One input, chosen by field kind: number, checkbox-like select, date, textarea, or text. */
function FieldInput(props: {
  field: FieldInfo;
  value: string;
  onChange(value: string): void;
}) {
  const { field, value, onChange } = props;
  const kind = fieldKind(field.type);
  const enabled = isEditable(field) && !field.masked;
  const common = {
    id: `f-${field.name}`,
    disabled: !enabled,
    'data-testid': `field-${field.name}`,
  };
  const options = field.validation?.enum;

  let input;
  if (options && options.length > 0) {
    input = (
      <select
        {...common}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" />
        {options.map((o) => (
          <option key={String(o)}>{String(o)}</option>
        ))}
      </select>
    );
  } else if (kind === 'boolean') {
    input = (
      <select
        {...common}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" />
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (kind === 'text' || kind === 'json') {
    input = (
      <textarea
        {...common}
        rows={kind === 'json' ? 3 : 4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    );
  } else {
    const type =
      kind === 'number'
        ? 'number'
        : kind === 'date'
          ? 'date'
          : kind === 'datetime'
            ? 'datetime-local'
            : 'text';
    input = (
      <input
        {...common}
        type={type}
        step={field.type === 'decimal' ? 'any' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <label className="field" htmlFor={common.id}>
      <span>
        {field.name}{' '}
        <span className="muted small">
          {field.type}
          {field.required ? ', required' : ''}
          {field.primaryKey ? ', key' : ''}
          {field.masked ? ', masked' : ''}
        </span>
      </span>
      {input}
    </label>
  );
}
