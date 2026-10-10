/**
 * Demonstrates the create form: fields come from the collection description,
 * submission goes to the createRecord Server Action.
 */
import Link from 'next/link';
import { createRecord } from '@/app/actions';
import { ErrorBox } from '@/components/ErrorBox';
import { RecordForm } from '@/components/RecordForm';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { getClient } from '@/lib/sethu';
import type { CollectionInfo, ConnectionInfo } from '@sethucms/sdk';

export const dynamic = 'force-dynamic';

export default async function NewRecord({
  params,
}: {
  params: Promise<{ connectionId: string; collection: string }>;
}) {
  const { connectionId, collection } = await params;
  let connection: ConnectionInfo | undefined;
  let info: CollectionInfo | undefined;
  let error: ErrorInfo | null = null;
  try {
    const cms = getClient();
    const [connections, collections] = await Promise.all([
      cms.connections(),
      cms.collections(connectionId),
    ]);
    connection = connections.find((c) => c.id === connectionId);
    info = collections.find((c) => c.name === collection);
    if (!info)
      error = { code: 'NOT_FOUND', message: `No collection "${collection}"` };
  } catch (e) {
    error = toErrorInfo(e);
  }
  const base = `/c/${encodeURIComponent(connectionId)}/${encodeURIComponent(collection)}`;

  return (
    <>
      <p className="crumbs">
        <Link href="/">Connections</Link> /{' '}
        <Link href={base}>{collection}</Link> / new
      </p>
      <h1>New record in {collection}</h1>
      {connection?.mode === 'read_only' ? (
        <p className="banner">
          This connection is read-only. The form is shown so you can see the
          gateway&apos;s READ_ONLY error when you submit.
        </p>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
      {info ? (
        <RecordForm
          mode="create"
          fields={info.fields}
          initial={{}}
          action={createRecord.bind(null, connectionId, collection)}
        />
      ) : null}
    </>
  );
}
