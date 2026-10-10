/** Shape returned by the record Server Actions to the client forms. */
import type { ErrorInfo } from './errors';

export interface FormState {
  error?: ErrorInfo;
  /** Raw form text sent back so a failed submit does not lose the input. */
  values?: Record<string, string>;
  /** Changes on every submit so the form remounts with the returned values. */
  nonce: number;
}

export const initialFormState: FormState = { nonce: 0 };
