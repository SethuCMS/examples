import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecordData } from '@sethucms/sdk';
import { ErrorBanner } from './components/ErrorBanner';
import { LiveFeed } from './components/LiveFeed';
import { Pickers } from './components/Pickers';
import { RecordForm } from './components/RecordForm';
import { RecordsTable } from './components/RecordsTable';
import { SelfCheck } from './components/SelfCheck';
import { SettingsBar } from './components/SettingsBar';
import { describeCollection, type Access } from './lib/describe';
import { fieldsOf, primaryKeyOf } from './lib/fields';
import {
  DEFAULT_GATEWAY_URL,
  makeClient,
  readSession,
  resolveBaseUrl,
  writeSession,
} from './lib/gateway';
import { useAsync } from './lib/useAsync';

/**
 * Page layout and shared state: gateway settings, the SDK client, the chosen
 * connection and collection, the record being edited, and a counter that makes
 * the table reload after writes and live events.
 */
export function App() {
  const [url, setUrl] = useState(
    () => readSession('sethucms.url') || DEFAULT_GATEWAY_URL,
  );
  const [token, setToken] = useState(() => readSession('sethucms.token'));
  const [connectionId, setConnectionId] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Session storage only (cleared when the tab closes). The token is never put in localStorage.
  useEffect(() => writeSession('sethucms.url', url), [url]);
  useEffect(() => writeSession('sethucms.token', token), [token]);

  const { cms, urlError } = useMemo(() => {
    try {
      return { cms: makeClient(url, token), urlError: '' };
    } catch (e) {
      return { cms: null, urlError: (e as Error).message };
    }
  }, [url, token]);

  const connections = useAsync(
    async (signal) => (cms ? cms.connections({ signal }) : []),
    [cms],
  );
  const connectionList = connections.data ?? [];
  const connection =
    connectionList.find((c) => c.id === connectionId) ?? connectionList[0];

  const collections = useAsync(
    async (signal) =>
      cms && connection ? cms.collections(connection.id, { signal }) : [],
    [cms, connection?.id],
  );
  const collectionList = collections.data ?? [];
  const baseCollection =
    collectionList.find((c) => c.name === collectionName) ?? collectionList[0];

  // Richer field info (validation, editable flags, access) from the single-collection endpoint.
  const detail = useAsync(
    async (signal) => {
      if (!connection || !baseCollection || !token) return undefined;
      const found = await describeCollection(
        resolveBaseUrl(url),
        token,
        baseCollection,
        connection.id,
        signal,
      );
      return { ...found, key: `${connection.id}/${baseCollection.name}` };
    },
    [cms, connection?.id, baseCollection?.name],
  );
  // Ignore a stale answer that belongs to the previously open collection.
  const fresh =
    detail.data?.key === `${connection?.id}/${baseCollection?.name}`
      ? detail.data
      : undefined;
  const collection =
    baseCollection && fresh
      ? { ...baseCollection, fields: fresh.fields }
      : baseCollection;
  const access: Access | undefined = fresh?.access;

  // Forget the record being edited when the collection changes.
  useEffect(() => setEditing(null), [connection?.id, collection?.name]);

  // Reload the table when a record in the OPEN collection changes (debounced).
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const open = useRef({ c: '', n: '' });
  open.current = { c: connection?.id ?? '', n: collection?.name ?? '' };
  const onRecordChange = (e: {
    connectionId?: string;
    collection?: string;
  }): void => {
    if (e.connectionId !== open.current.c || e.collection !== open.current.n)
      return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefreshKey((n) => n + 1), 150);
  };

  const pk = collection ? primaryKeyOf(fieldsOf(collection)) : undefined;
  const selectedId = editing && pk ? String(editing[pk]) : null;

  return (
    <>
      <SettingsBar
        url={url}
        token={token}
        cms={cms}
        urlError={urlError}
        onUrl={setUrl}
        onToken={setToken}
      />
      <main className="layout">
        <div className="col">
          <section className="panel">
            <h2>Connection and collection</h2>
            <ErrorBanner error={connections.error} />
            <ErrorBanner error={collections.error} />
            {!token && (
              <div className="notice">
                Paste the admin token printed on the gateway&apos;s first start.
              </div>
            )}
            <Pickers
              connections={connectionList}
              collections={collectionList}
              connectionId={connection?.id ?? ''}
              collection={collection?.name ?? ''}
              onConnection={setConnectionId}
              onCollection={setCollectionName}
            />
          </section>
          {cms && connection && collection && (
            <>
              <RecordsTable
                cms={cms}
                connection={connection}
                collection={collection}
                refreshKey={refreshKey}
                selectedId={selectedId}
                onEdit={setEditing}
              />
              <RecordForm
                cms={cms}
                connection={connection}
                collection={collection}
                record={editing}
                access={access}
                onChanged={() => setRefreshKey((n) => n + 1)}
                onReset={() => setEditing(null)}
              />
            </>
          )}
        </div>
        <div className="col side">
          <SelfCheck
            cms={cms}
            connectionId={connection?.id ?? ''}
            collection={collection?.name ?? ''}
          />
          <LiveFeed
            baseUrl={resolveBaseUrl(url)}
            token={token}
            onRecordChange={onRecordChange}
          />
        </div>
      </main>
    </>
  );
}
