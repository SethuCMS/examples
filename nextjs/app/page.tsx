/**
 * Demonstrates a Server Component calling the SDK: lists the connections the
 * token can use, with their mode (read_only / read_write) and health.
 */
import Link from 'next/link';
import { ErrorBox } from '@/components/ErrorBox';
import { ModeBadge } from '@/components/ModeBadge';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { getClient } from '@/lib/sethu';
import type { ConnectionInfo } from '@sethucms/sdk';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let connections: ConnectionInfo[] = [];
  let error: ErrorInfo | null = null;
  try {
    connections = await getClient().connections();
  } catch (e) {
    error = toErrorInfo(e);
  }

  return (
    <>
      <h1>Connections</h1>
      <p className="muted">
        Rendered on the server with{' '}
        <span className="code">client.connections()</span>.
      </p>
      {error ? <ErrorBox error={error} /> : null}
      {!error && connections.length === 0 ? (
        <p>No connections yet. Add one in the SethuCMS admin app.</p>
      ) : null}
      {connections.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Id</th>
              <th>Adapter</th>
              <th>Mode</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/c/${encodeURIComponent(c.id)}`}>{c.name}</Link>
                </td>
                <td>
                  <span className="code">{c.id}</span>
                </td>
                <td>{c.adapterType}</td>
                <td>
                  <ModeBadge mode={c.mode} />
                </td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
