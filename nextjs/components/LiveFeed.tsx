'use client';

/**
 * Demonstrates the live change feed in the browser. EventSource talks to
 * /api/events on THIS origin; that route handler adds the token on the server
 * and relays the gateway's /v1/events stream. The token never leaves the server.
 */
import { useEffect, useState } from 'react';

const TYPES = [
  'record.created',
  'record.updated',
  'record.deleted',
  'draft.created',
  'draft.updated',
  'draft.discarded',
  'draft.published',
  'connection.changed',
];

interface Item {
  key: number;
  at: string;
  type: string;
  detail: string;
}

export function LiveFeed() {
  const [status, setStatus] = useState<'connecting' | 'live' | 'reconnecting'>(
    'connecting',
  );
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let n = 0;
    const source = new EventSource('/api/events');
    source.addEventListener('ready', () => setStatus('live'));
    source.onerror = () => setStatus('reconnecting'); // EventSource retries by itself
    const add = (type: string) => (e: MessageEvent<string>) => {
      let detail = e.data;
      try {
        const d = JSON.parse(e.data) as Record<string, unknown>;
        detail = [d.connectionId, d.collection, d.recordId ?? d.draftId]
          .filter(Boolean)
          .join(' / ');
      } catch {
        /* keep raw text */
      }
      setItems((old) =>
        [
          { key: ++n, at: new Date().toLocaleTimeString(), type, detail },
          ...old,
        ].slice(0, 50),
      );
    };
    for (const t of TYPES) source.addEventListener(t, add(t));
    return () => source.close();
  }, []);

  return (
    <div>
      <p>
        Status: <strong data-testid="feed-status">{status}</strong>
      </p>
      {items.length === 0 ? (
        <p className="muted">
          No events yet. Create, edit or delete a record in another tab.
        </p>
      ) : (
        <ul className="feed" data-testid="feed">
          {items.map((i) => (
            <li key={i.key}>
              <time>{i.at}</time> <span className="code">{i.type}</span>{' '}
              {i.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
