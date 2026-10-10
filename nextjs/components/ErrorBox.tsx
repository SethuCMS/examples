/**
 * Demonstrates showing a SethuApiError clearly: code, message, HTTP status,
 * request id (quote it to support), details and a hint. Plain data only, so
 * it works in server and client components.
 */
import type { ErrorInfo } from '@/lib/errors';

export function ErrorBox({ error }: { error: ErrorInfo }) {
  return (
    <div className="error" role="alert">
      <p>
        <span className="code">{error.code}</span> {error.message}
      </p>
      {error.hint ? <p className="hint">{error.hint}</p> : null}
      {error.details ? <pre>{error.details}</pre> : null}
      <p className="meta">
        {error.status !== undefined ? `HTTP ${error.status}` : null}
        {error.requestId ? ` · request id ${error.requestId}` : null}
      </p>
    </div>
  );
}
