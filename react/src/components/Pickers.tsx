import type { CollectionInfo, ConnectionInfo } from '@sethucms/sdk';

/**
 * Connection picker and collection picker. The lists come from
 * `cms.connections()` and `cms.collections(connectionId)` (loaded in App).
 * A read_only connection is flagged here and disables writes further down.
 */
export function Pickers(props: {
  connections: ConnectionInfo[];
  collections: CollectionInfo[];
  connectionId: string;
  collection: string;
  onConnection(id: string): void;
  onCollection(name: string): void;
}) {
  const { connections, collections, connectionId, collection } = props;
  const current = connections.find((c) => c.id === connectionId);
  return (
    <div className="row pickers">
      <label>
        Connection
        <select
          data-testid="connection"
          value={connectionId}
          onChange={(e) => props.onConnection(e.target.value)}
        >
          {connections.length === 0 && <option value="">(none)</option>}
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} [{c.adapterType}, {c.mode}]
            </option>
          ))}
        </select>
      </label>
      <label>
        Collection
        <select
          data-testid="collection"
          value={collection}
          onChange={(e) => props.onCollection(e.target.value)}
        >
          {collections.length === 0 && <option value="">(none)</option>}
          {collections.map((c) => (
            <option key={c.name} value={c.name}>
              {c.displayName || c.name}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <span
          className={`badge ${current.mode === 'read_only' ? 'warn' : 'ok'}`}
          data-testid="mode"
        >
          {current.mode} / {current.status}
        </span>
      )}
    </div>
  );
}
