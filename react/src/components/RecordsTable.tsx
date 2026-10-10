import { useState } from 'react';
import {
  contains,
  eq,
  gt,
  gte,
  lt,
  lte,
  ne,
  startsWith,
  type CollectionInfo,
  type ConnectionInfo,
  type Filter,
  type RecordData,
  type SethuClient,
} from '@sethucms/sdk';
import { cellText, fieldKind, fieldsOf, filterValue } from '../lib/fields';
import { useAsync } from '../lib/useAsync';
import { ErrorBanner } from './ErrorBanner';

// Filter helpers from the SDK, keyed by the operator shown in the dropdown.
const OPS = {
  eq,
  ne,
  contains,
  startsWith: (field: string, value: string | number | boolean) =>
    startsWith(field, String(value)),
  gt,
  gte,
  lt,
  lte,
} as const;
type OpName = keyof typeof OPS;

interface Sort {
  field: string;
  dir: 'asc' | 'desc';
}

/**
 * Records table. Demonstrates the SDK query builder:
 *  - `.orderBy(field, dir)` (click a column header to cycle asc / desc / off),
 *  - `.where(eq(...) | contains(...) | ...)` from the filter box,
 *  - `.limit(n)` and `.after(cursor)` with the `nextCursor` of the list result.
 * "Previous" works by remembering the cursors already used (the API only
 * gives a cursor for the next page).
 */
export function RecordsTable(props: {
  cms: SethuClient;
  connection: ConnectionInfo;
  collection: CollectionInfo;
  refreshKey: number;
  selectedId: string | null;
  onEdit(record: RecordData): void;
}) {
  const { cms, connection, collection, refreshKey, selectedId, onEdit } = props;
  const fields = fieldsOf(collection);

  const [sort, setSort] = useState<Sort | null>(null);
  const [limit, setLimit] = useState(5);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [applied, setApplied] = useState<{
    field: string;
    op: OpName;
    raw: string;
  } | null>(null);
  const [draft, setDraft] = useState({
    field: fields[0]?.name ?? '',
    op: 'contains' as OpName,
    raw: '',
  });
  const [filterError, setFilterError] = useState('');

  // Build the filter from the applied filter-box values (null when empty).
  const buildFilter = (): Filter | null => {
    if (!applied || applied.raw === '') return null;
    const field = fields.find((f) => f.name === applied.field);
    const kind = field ? fieldKind(field.type) : 'string';
    return OPS[applied.op](applied.field, filterValue(kind, applied.raw));
  };

  const cursor = cursors[cursors.length - 1] ?? null;
  const key = `${connection.id}/${collection.name}`;
  const result = useAsync(
    async (signal) => {
      let query = cms
        .collection(connection.id, collection.name)
        .query()
        .limit(limit);
      const filter = buildFilter();
      if (filter) query = query.where(filter);
      if (sort) query = query.orderBy(sort.field, sort.dir);
      if (cursor) query = query.after(cursor);
      return query.list({ signal });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cms, key, sort, limit, applied, cursor, refreshKey],
  );

  const resetPaging = (): void => setCursors([null]);
  const cycleSort = (field: string): void => {
    resetPaging();
    setSort((s) =>
      !s || s.field !== field
        ? { field, dir: 'asc' }
        : s.dir === 'asc'
          ? { field, dir: 'desc' }
          : null,
    );
  };
  const apply = (): void => {
    try {
      const field = fields.find((f) => f.name === draft.field);
      filterValue(field ? fieldKind(field.type) : 'string', draft.raw); // validate early
      setFilterError('');
      resetPaging();
      setApplied(draft.raw === '' ? null : { ...draft });
    } catch (e) {
      setFilterError((e as Error).message);
    }
  };

  const page = result.data;
  const pk = fields.find((f) => f.primaryKey)?.name;
  const filterJson = (() => {
    try {
      return JSON.stringify(buildFilter());
    } catch {
      return '';
    }
  })();

  return (
    <section className="panel">
      <h2>Records</h2>
      <div className="row filter">
        <select
          data-testid="filter-field"
          value={draft.field}
          onChange={(e) => setDraft({ ...draft, field: e.target.value })}
        >
          {fields.map((f) => (
            <option key={f.name}>{f.name}</option>
          ))}
        </select>
        <select
          data-testid="filter-op"
          value={draft.op}
          onChange={(e) => setDraft({ ...draft, op: e.target.value as OpName })}
        >
          {Object.keys(OPS).map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
        <input
          data-testid="filter-value"
          placeholder="filter value"
          value={draft.raw}
          onChange={(e) => setDraft({ ...draft, raw: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
        <button type="button" onClick={apply} data-testid="filter-apply">
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ ...draft, raw: '' });
            setApplied(null);
            resetPaging();
            setFilterError('');
          }}
        >
          Clear
        </button>
        <button type="button" onClick={result.reload} data-testid="reload">
          Reload
        </button>
      </div>
      {filterError && <div className="error-inline">{filterError}</div>}
      {filterJson && filterJson !== 'null' && (
        <div className="muted small">
          filter sent: <code>{filterJson}</code>
        </div>
      )}

      <ErrorBanner error={result.error} />

      <div className="table-wrap">
        <table data-testid="records">
          <thead>
            <tr>
              {fields.map((f) => (
                <th
                  key={f.name}
                  onClick={() => cycleSort(f.name)}
                  className="sortable"
                  data-testid={`th-${f.name}`}
                >
                  {f.name}
                  {sort?.field === f.name
                    ? sort.dir === 'asc'
                      ? ' ▲'
                      : ' ▼'
                    : ''}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {page?.data.map((record, i) => {
              const id = pk ? String(record[pk]) : String(i);
              return (
                <tr
                  key={id}
                  className={id === selectedId ? 'selected' : ''}
                  data-testid="row"
                >
                  {fields.map((f) => (
                    <td key={f.name} title={cellText(record[f.name])}>
                      {cellText(record[f.name])}
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      onClick={() => onEdit(record)}
                      data-testid="edit"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {page && page.data.length === 0 && (
              <tr>
                <td colSpan={fields.length + 1} className="muted">
                  No records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row pager">
        <button
          type="button"
          disabled={cursors.length <= 1 || result.loading}
          onClick={() => setCursors((c) => c.slice(0, -1))}
          data-testid="prev"
        >
          Previous
        </button>
        <span data-testid="page-info">
          page {cursors.length}
          {page ? `, ${page.data.length} record(s)` : ''}
          {result.loading ? ' (loading)' : ''}
        </span>
        <button
          type="button"
          disabled={!page?.nextCursor || result.loading}
          onClick={() =>
            page?.nextCursor && setCursors((c) => [...c, page.nextCursor])
          }
          data-testid="next"
        >
          Next
        </button>
        <label className="inline">
          Page size
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              resetPaging();
            }}
          >
            {[2, 5, 10, 25].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      {page && page.notes.length > 0 && (
        <div className="muted small">server notes: {page.notes.join('; ')}</div>
      )}
    </section>
  );
}
