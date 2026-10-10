import { useEffect, useState } from 'react';
import type { SethuClient } from '@sethucms/sdk';

/**
 * Settings bar. Demonstrates:
 *  - creating a SethuClient from a base URL and bearer token (done in App),
 *  - `cms.isHealthy()` as a health indicator (it never throws),
 *  - keeping the token in React state, mirrored to sessionStorage only.
 * Type /api as the address to go through the Vite dev proxy.
 */
export function SettingsBar(props: {
  url: string;
  token: string;
  cms: SethuClient | null;
  urlError: string;
  onUrl(value: string): void;
  onToken(value: string): void;
}) {
  const { url, token, cms, urlError, onUrl, onToken } = props;
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [showToken, setShowToken] = useState(false);

  // Probe now and every 10 seconds; forget the old answer when the client changes.
  useEffect(() => {
    setHealthy(null);
    if (!cms) return;
    let cancelled = false;
    const probe = (): void => {
      void cms.isHealthy().then((ok) => {
        if (!cancelled) setHealthy(ok);
      });
    };
    probe();
    const timer = setInterval(probe, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cms]);

  const label =
    healthy === null ? 'checking' : healthy ? 'healthy' : 'unreachable';
  return (
    <header className="settings">
      <h1>SethuCMS React test UI</h1>
      <label>
        Gateway URL
        <input
          data-testid="gateway-url"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label>
        Bearer token
        <span className="row">
          <input
            data-testid="token"
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => onToken(e.target.value)}
            placeholder="admin token"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={() => setShowToken(!showToken)}>
            {showToken ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>
      <span
        className={`health ${healthy === null ? 'wait' : healthy ? 'ok' : 'bad'}`}
        data-testid="health"
      >
        <span className="dot" /> {label}
      </span>
      {urlError && <span className="error-inline">{urlError}</span>}
    </header>
  );
}
