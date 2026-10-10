/**
 * Demonstrates a server-rendered records table driven by searchParams:
 * sort (?sort=&dir=), filter (?ff=&fo=&fv=), page size (?limit=) and cursor
 * pagination (?cursor=). Everything is a plain link or GET form, no client JS.
 */
import Link from 'next/link';
import { contains, eq, gt, lt, startsWith, type Filter } from '@sethucms/sdk';
import type { CollectionInfo, ConnectionInfo, ListResult } from '@sethucms/sdk';
import { DeleteButton } from '@/components/DeleteButton';
import { ErrorBox } from '@/components/ErrorBox';
import { ModeBadge } from '@/components/ModeBadge';
import { deleteRecord } from '@/app/actions';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { kindOf, primaryKeyOf, toCellText } from '@/lib/fields';
import { getClient } from '@/lib/sethu';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

const OPS = ['contains', 'eq', 'startsWith', 'gt', 'lt'] as const;
type Op = (typeof OPS)[number];
const LIMITS = [5, 10, 25, 50];

export default async function RecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string; collection: string }>;
  searchParams: Promise<Search>;
}) {
  const { connectionId, collection } = await params;
  const sp = await searchParams;
  const sort = first(sp['sort']);
  const dir = first(sp['dir']) === 'desc' ? 'desc' : 'asc';
  const ff = first(sp['ff']);
  const fo = (OPS as readonly string[]).includes(first(sp['fo']))
    ? (first(sp['fo']) as Op)
    : 'contains';
  const fv = first(sp['fv']);
  const cursor = first(sp['cursor']);
  const limitRaw = Number(first(sp['limit']));
  const limit = LIMITS.includes(limitRaw) ? limitRaw : 10;
  const notice = first(sp['notice']);

  let connection: ConnectionInfo | undefined;
  let info: CollectionInfo | undefined;
  let page: ListResult | undefined;
  let error: ErrorInfo | null = null;

  try {
    const cms = getClient();
    const [connections, collections] = await Promise.all([
      cms.connections(),
      cms.collections(connectionId),
    ]);
    connection = connections.find((c) => c.id === connectionId);
    info = collections.find((c) => c.name === collection);
    if (!info) {
      error = { code: 'NOT_FOUND', message: `No collection "${collection}"` };
    } else {
      let query = cms.collection(connectionId, collection).query();
      const filterField = info.fields.find((f) => f.name === ff);
      if (filterField && fv !== '') {
        query = query.where(
          buildFilter(filterField.name, kindOf(filterField.type), fo, fv),
        );
      }
      if (info.fields.some((f) => f.name === sort))
        query = query.orderBy(sort, dir);
      query = query.limit(limit);
      if (cursor) query = query.after(cursor);
      page = await query.list();
    }
  } catch (e) {
    error = toErrorInfo(e);
  }

  const readOnly = connection?.mode === 'read_only';
  const pk = info ? primaryKeyOf(info.fields) : 'id';
  const base = `/c/${encodeURIComponent(connectionId)}/${encodeURIComponent(collection)}`;

  // Build a link that keeps the current view but changes some parameters.
  const link = (change: Record<string, string>): string => {
    const q = new URLSearchParams();
    const now: Record<string, string> = {
      sort,
      dir,
      ff,
      fo,
      fv,
      limit: String(limit),
      ...change,
    };
    for (const [k, v] of Object.entries(now)) {
      if (v !== '' && !(k === 'sort' && !now['sort'])) q.set(k, v);
    }
    const text = q.toString();
    return text ? `${base}?${text}` : base;
  };

  return (
    <>
      <p className="crumbs">
        <Link href="/">Connections</Link> /{' '}
        <Link href={`/c/${encodeURIComponent(connectionId)}`}>
          {connection?.name ?? connectionId}
        </Link>{' '}
        / {collection}
      </p>
      <h1>
        {collection} {connection ? <ModeBadge mode={connection.mode} /> : null}
      </h1>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {readOnly ? (
        <p className="banner">
          Read-only connection: create, edit and delete are hidden here (the
          gateway would answer READ_ONLY anyway).
        </p>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}

      {info ? (
        <>
          <form method="get" action={base} className="toolbar">
            <label>
              Filter field
              <select name="ff" defaultValue={ff}>
                <option value="">(none)</option>
                {info.fields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator
              <select name="fo" defaultValue={fo}>
                {OPS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input name="fv" defaultValue={fv} />
            </label>
            <label>
              Page size
              <select name="limit" defaultValue={String(limit)}>
                {LIMITS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            {sort ? <input type="hidden" name="sort" value={sort} /> : null}
            {sort ? <input type="hidden" name="dir" value={dir} /> : null}
            <button type="submit">Apply</button>
            <Link className="button secondary" href={base}>
              Reset
            </Link>
            {!readOnly ? (
              <Link className="button" href={`${base}/new`}>
                New record
              </Link>
            ) : null}
          </form>

          {page ? (
            <>
              <table data-testid="records">
                <thead>
                  <tr>
                    {info.fields.map((f) => (
                      <th key={f.name}>
                        <Link
                          href={link({
                            sort: f.name,
                            dir:
                              sort === f.name && dir === 'asc' ? 'desc' : 'asc',
                            cursor: '',
                          })}
                        >
                          {f.name}
                          {sort === f.name ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </Link>
                      </th>
                    ))}
                    {!readOnly ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((row, i) => {
                    const id = String(row[pk] ?? '');
                    return (
                      <tr key={id || i}>
                        {info.fields.map((f) => (
                          <td className="cell" key={f.name}>
                            {toCellText(row[f.name])}
                          </td>
                        ))}
                        {!readOnly ? (
                          <td>
                            <Link href={`${base}/${encodeURIComponent(id)}`}>
                              Edit
                            </Link>{' '}
                            <DeleteButton
                              action={deleteRecord.bind(
                                null,
                                connectionId,
                                collection,
                                id,
                              )}
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  {page.data.length === 0 ? (
                    <tr>
                      <td colSpan={info.fields.length + 1} className="muted">
                        No records match.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <div className="pager">
                {cursor ? (
                  <Link href={link({ cursor: '' })}>« First page</Link>
                ) : null}
                <span className="muted">
                  {page.data.length} shown · page size {page.limit}
                </span>
                {page.nextCursor ? (
                  <Link href={link({ cursor: page.nextCursor })}>
                    Next page »
                  </Link>
                ) : (
                  <span className="muted">last page</span>
                )}
              </div>
              {page.notes.length > 0 ? (
                <p className="muted">Gateway notes: {page.notes.join(' · ')}</p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Turn the filter form into an SDK filter, converting the text to the field's type. */
function buildFilter(
  field: string,
  kind: ReturnType<typeof kindOf>,
  op: Op,
  text: string,
): Filter {
  const value: string | number | boolean =
    kind === 'number' && Number.isFinite(Number(text))
      ? Number(text)
      : kind === 'boolean'
        ? text === 'true'
        : text;
  switch (op) {
    case 'eq':
      return eq(field, value);
    case 'startsWith':
      return startsWith(field, String(value));
    case 'gt':
      return gt(field, value);
    case 'lt':
      return lt(field, value);
    default:
      return contains(field, value);
  }
}
