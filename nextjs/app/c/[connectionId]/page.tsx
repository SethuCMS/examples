/**
 * Demonstrates listing the collections of one connection (server-rendered),
 * including the read-only banner.
 */
import Link from 'next/link';
import { ErrorBox } from '@/components/ErrorBox';
import { ModeBadge } from '@/components/ModeBadge';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { getClient } from '@/lib/sethu';
import type { CollectionInfo, ConnectionInfo } from '@sethucms/sdk';

export const dynamic = 'force-dynamic';

export default async function ConnectionPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  let connection: ConnectionInfo | undefined;
  let collections: CollectionInfo[] = [];
  let error: ErrorInfo | null = null;
  try {
    const cms = getClient();
    [connection, collections] = await Promise.all([
      cms.connections().then((all) => all.find((c) => c.id === connectionId)),
      cms.collections(connectionId),
    ]);
  } catch (e) {
    error = toErrorInfo(e);
  }

  return (
    <>
      <p className="crumbs">
        <Link href="/">Connections</Link> / {connectionId}
      </p>
      <h1>
        {connection?.name ?? connectionId}{' '}
        {connection ? <ModeBadge mode={connection.mode} /> : null}
      </h1>
      {connection?.mode === 'read_only' ? (
        <p className="banner">
          This connection is read-only: records can be browsed but not changed.
        </p>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
      {collections.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Collection</th>
              <th>Fields</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((c) => (
              <tr key={c.name}>
                <td>
                  <Link
                    href={`/c/${encodeURIComponent(connectionId)}/${encodeURIComponent(c.name)}`}
                  >
                    {c.displayName}
                  </Link>
                </td>
                <td>{c.fields.map((f) => f.name).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
