import { describeError } from '../lib/gateway';

/**
 * Shows a failed API call clearly: the SethuApiError `code` (for example
 * VALIDATION_FAILED or AUTH_FAILED), the message, HTTP status and the request
 * id you would quote in a bug report. Renders nothing when there is no error.
 */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const e = describeError(error);
  return (
    <div className="error" role="alert">
      <strong data-testid="error-code">{e.code}</strong>
      {e.status ? <span className="muted"> HTTP {e.status}</span> : null}
      <div data-testid="error-message">{e.message}</div>
      {e.details !== undefined && (
        <pre className="small">{JSON.stringify(e.details, null, 2)}</pre>
      )}
      {e.requestId && (
        <div className="muted small">request id: {e.requestId}</div>
      )}
    </div>
  );
}
