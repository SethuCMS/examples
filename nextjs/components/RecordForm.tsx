'use client';

/**
 * Demonstrates a form generated from the collection field list. It runs in
 * the browser but only calls a Server Action passed in as a prop; it never
 * sees the token. The submitted text is returned on error so nothing is lost.
 */
import { useActionState } from 'react';
import { ErrorBox } from './ErrorBox';
import { kindOf, type FieldInfo } from '@/lib/fields';
import { initialFormState, type FormState } from '@/lib/form-state';

interface Props {
  fields: FieldInfo[];
  /** Prefilled text per field (edit) or empty (create). */
  initial: Record<string, string>;
  mode: 'create' | 'edit';
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}

export function RecordForm({ fields, initial, mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const values = state.values ?? initial;

  return (
    <form action={formAction} key={state.nonce} className="form">
      {state.error ? <ErrorBox error={state.error} /> : null}
      {fields.map((f) => {
        const kind = kindOf(f.type);
        const id = `f_${f.name}`;
        const value = values[f.name] ?? '';
        const lockedKey = mode === 'edit' && f.primaryKey;
        return (
          <div className="row" key={f.name}>
            <label htmlFor={id}>
              {f.name}
              <small>
                {f.type}
                {f.required ? ' · required' : ''}
                {f.primaryKey ? ' · key' : ''}
              </small>
            </label>
            {kind === 'boolean' ? (
              <input
                id={id}
                name={id}
                type="checkbox"
                defaultChecked={value === 'on'}
              />
            ) : kind === 'text' || kind === 'json' ? (
              <textarea
                id={id}
                name={id}
                rows={kind === 'json' ? 4 : 5}
                defaultValue={value}
                className={kind === 'json' ? 'mono' : undefined}
              />
            ) : (
              <input
                id={id}
                name={id}
                type={
                  kind === 'number'
                    ? 'number'
                    : kind === 'date'
                      ? 'date'
                      : kind === 'datetime'
                        ? 'datetime-local'
                        : 'text'
                }
                step={kind === 'number' ? 'any' : undefined}
                defaultValue={value}
                readOnly={lockedKey}
                placeholder={
                  f.primaryKey && mode === 'create'
                    ? 'leave empty if generated'
                    : undefined
                }
              />
            )}
          </div>
        );
      })}
      <button type="submit" disabled={pending}>
        {pending
          ? 'Saving…'
          : mode === 'create'
            ? 'Create record'
            : 'Save changes'}
      </button>
    </form>
  );
}
