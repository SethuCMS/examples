import { useEffect, useRef, useState } from 'react';
import { streamEvents, type StreamStatus } from '../lib/events';
import { describeError } from '../lib/gateway';

/** A row in the feed. */
interface FeedItem {
  n: number;
  at: string;
  type: string;
  summary: string;
}

/** Payload fields the gateway puts on record events (ids only, never values). */
interface ChangeEvent {
  connectionId?: string;
  collection?: string;
  recordId?: string;
}

/** One entry of GET /v1/changes. */
interface ChangeEntry extends ChangeEvent {
  seq: number;
  at: string;
  type: string;
}

/**
 * Live feed. Demonstrates the gateway change stream, GET /v1/events (SSE).
 * The gateway wants "Authorization: Bearer ..." on it, which the browser's
 * EventSource cannot send, so lib/events.ts reads the stream with fetch.
 * When a record event arrives for the open collection, `onRecordChange` is
 * called so the table can reload. The second button polls GET /v1/changes,
 * the resumable log behind the same events.
 */
export function LiveFeed(props: {
  baseUrl: string;
  token: string;
  onRecordChange(event: ChangeEvent): void;
}) {
  const { baseUrl, token, onRecordChange } = props;
  const [status, setStatus] = useState<StreamStatus | 'off'>('off');
  const [detail, setDetail] = useState('');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [changes, setChanges] = useState<string[] | null>(null);
  const [changesError, setChangesError] = useState('');
  const counter = useRef(0);
  // Keep the newest callback without restarting the stream when it changes.
  const callback = useRef(onRecordChange);
  callback.current = onRecordChange;

  useEffect(() => {
    if (!token || !baseUrl || paused) {
      setStatus('off');
      return;
    }
    const controller = new AbortController();
    void streamEvents({
      baseUrl,
      token,
      signal: controller.signal,
      onStatus: (s, d) => {
        setStatus(s);
        setDetail(d ?? '');
      },
      onEvent: (event) => {
        const data = (event.data ?? {}) as ChangeEvent;
        const summary = data.collection
          ? `${data.connectionId ?? '?'} / ${data.collection} / ${data.recordId ?? ''}`
          : JSON.stringify(event.data);
        counter.current += 1;
        const item: FeedItem = {
          n: counter.current,
          at: new Date().toLocaleTimeString(),
          type: event.type,
          summary,
        };
        setItems((list) => [item, ...list].slice(0, 100));
        if (event.type.startsWith('record.')) callback.current(data);
      },
    });
    return () => controller.abort();
  }, [baseUrl, token, paused]);

  // Poll the change log once: the last few entries after sequence 0.
  const loadChanges = async (): Promise<void> => {
    setChangesError('');
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/v1/changes?since=0&limit=500`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'omit',
        },
      );
      const body = (await response.json()) as {
        data?: ChangeEntry[];
        head?: number;
        error?: { code: string; message: string };
      };
      if (!response.ok)
        throw new Error(
          `${body.error?.code ?? response.status}: ${body.error?.message ?? 'request failed'}`,
        );
      const rows = (body.data ?? [])
        .slice(-10)
        .map(
          (c) =>
            `#${c.seq} ${c.type} ${c.collection ?? ''} ${c.recordId ?? ''}`,
        );
      setChanges([`head=${body.head ?? '?'}`, ...rows]);
    } catch (e) {
      setChangesError(describeError(e).message);
    }
  };

  return (
    <section className="panel">
      <h2>Live feed</h2>
      <div className="row">
        <span
          className={`badge ${status === 'open' ? 'ok' : status === 'error' ? 'bad' : 'warn'}`}
          data-testid="feed-status"
        >
          {status}
        </span>
        <button type="button" onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" onClick={() => setItems([])}>
          Clear
        </button>
        <button
          type="button"
          onClick={() => void loadChanges()}
          disabled={!token}
          data-testid="load-changes"
        >
          Poll /v1/changes
        </button>
      </div>
      {detail && (
        <div className="muted small" data-testid="feed-detail">
          {detail}
        </div>
      )}
      {!token && (
        <div className="muted">Enter a token to start the stream.</div>
      )}
      <ol className="feed" data-testid="feed">
        {items.map((item) => (
          <li key={item.n} data-testid="feed-item">
            <span className="muted">{item.at}</span>{' '}
            <strong>{item.type}</strong> {item.summary}
          </li>
        ))}
      </ol>
      {changesError && <div className="error-inline">{changesError}</div>}
      {changes && (
        <pre className="small" data-testid="changes">
          {changes.join('\n')}
        </pre>
      )}
    </section>
  );
}
