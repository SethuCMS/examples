'use client';

/**
 * Demonstrates a delete button wired to a Server Action. The error (for
 * example READ_ONLY) is shown next to the button.
 */
import { useActionState } from 'react';
import { ErrorBox } from './ErrorBox';
import { initialFormState, type FormState } from '@/lib/form-state';

export function DeleteButton({
  action,
  label = 'Delete',
}: {
  action: (prev: FormState) => Promise<FormState>;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) => {
        if (!window.confirm('Delete this record?')) e.preventDefault();
      }}
    >
      <button type="submit" className="danger" disabled={pending}>
        {pending ? 'Deleting…' : label}
      </button>
      {state.error ? <ErrorBox error={state.error} /> : null}
    </form>
  );
}
