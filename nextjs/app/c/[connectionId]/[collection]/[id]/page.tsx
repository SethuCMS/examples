/**
 * Demonstrates the edit form: reads one record with the SDK, prefills a form
 * generated from the field list, saves through the updateRecord Server Action.
 */
import Link from 'next/link';
import { deleteRecord, updateRecord } from '@/app/actions';
import { DeleteButton } from '@/components/DeleteButton';
import { ErrorBox } from '@/components/ErrorBox';
import { RecordForm } from '@/components/RecordForm';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { kindOf, toInputText } from '@/lib/fields';
import { getClient } from '@/lib/sethu';
import type { CollectionInfo, ConnectionInfo, RecordData } from '@sethucms/sdk';

export const dynamic = 'force-dynamic';

export default async function EditRecord({
  params,
}: {
  params: Promise<{ connectionId: string; collection: string; id: string }>;
}) {
  const { connectionId, collection, id } = await params;
  let connection: ConnectionInfo | undefined;
  let info: CollectionInfo | undefined;
  let record: RecordData | undefined;
  let error: ErrorInfo | null = null;
  try {
    const cms = getClient();
    const [connections, collections, found] = await Promise.all([
      cms.connections(),
      cms.collections(connectionId),
      cms.collection(connectionId, collection).get(id),
    ]);
    connection = connections.find((c) => c.id === connectionId);
    info = collections.find((c) => c.name === collection);
    record = found;
    if (!info)
      error = { code: 'NOT_FOUND', message: `No collection "${collection}"` };
  } catch (e) {
    error = toErrorInfo(e);
  }
  const base = `/c/${encodeURIComponent(connectionId)}/${encodeURIComponent(collection)}`;
  const readOnly = connection?.mode === 'read_only';

  const initial: Record<string, string> = {};
  if (info && record) {
    for (const f of info.fields)
      initial[f.name] = toInputText(kindOf(f.type), record[f.name]);
  }

  return (
    <>
      <p className="crumbs">
        <Link href="/">Connections</Link> /{' '}
        <Link href={base}>{collection}</Link> / {id}
      </p>
      <h1>
        Edit {collection} / {id}
      </h1>
      {readOnly ? (
        <p className="banner">
          This connection is read-only. Saving will show the gateway&apos;s
          READ_ONLY error.
        </p>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
      {info && record ? (
        <>
          <RecordForm
            mode="edit"
            fields={info.fields}
            initial={initial}
            action={updateRecord.bind(null, connectionId, collection, id)}
          />
          {!readOnly ? (
            <p>
              <DeleteButton
                label="Delete this record"
                action={deleteRecord.bind(null, connectionId, collection, id)}
              />
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
