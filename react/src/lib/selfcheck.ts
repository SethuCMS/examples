/**
 * The self-check sequence: the same calls an app would make, run in order,
 * each reported as pass / fail / skipped. Plain async code with no React.
 */
import type {
  SethuClient,
  ConnectionInfo,
  CollectionInfo,
  RecordData,
} from '@sethucms/sdk';
import { errorLine } from './gateway';
import {
  fieldKind,
  fieldsOf,
  isEditable,
  primaryKeyOf,
  type FieldInfo,
} from './fields';

/** Outcome of one step. */
export type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip';

/** One line of the report. */
export interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail: string;
}

/** The ordered step list (all pending). */
export function initialSteps(): Step[] {
  const labels: Array<[string, string]> = [
    ['health', 'Gateway health (isHealthy)'],
    ['connections', 'List connections'],
    ['collections', 'List collections'],
    ['list', 'List records (first page)'],
    ['create', 'Create a record in a scratch collection'],
    ['read', 'Read it back by id'],
    ['update', 'Update it'],
    ['verify', 'Read back the update'],
    ['delete', 'Delete it'],
    ['gone', 'Confirm it is gone (NOT_FOUND)'],
  ];
  return labels.map(([id, label]) => ({
    id,
    label,
    status: 'pending',
    detail: '',
  }));
}

/** Run the sequence, calling `onStep` whenever a step changes. */
export async function runSelfCheck(
  cms: SethuClient,
  preferred: { connectionId: string; collection: string },
  onStep: (step: Step) => void,
): Promise<void> {
  const steps = new Map(initialSteps().map((s) => [s.id, s]));
  const set = (id: string, status: StepStatus, detail = ''): void => {
    const step = steps.get(id);
    if (!step) return;
    step.status = status;
    step.detail = detail;
    onStep({ ...step });
  };
  // Run one step; a thrown error marks it failed and stops the chain (returns undefined).
  const run = async <T>(
    id: string,
    fn: () => Promise<{ value: T; detail: string }>,
  ): Promise<T | undefined> => {
    set(id, 'running');
    try {
      const { value, detail } = await fn();
      set(id, 'pass', detail);
      return value;
    } catch (error) {
      set(id, 'fail', errorLine(error));
      return undefined;
    }
  };
  const skipRest = (from: string[], why: string): void =>
    from.forEach((id) => set(id, 'skip', why));

  const healthy = await run('health', async () => {
    if (!(await cms.isHealthy()))
      throw new Error('GET /v1/health did not answer ok');
    return { value: true, detail: 'gateway is ready' };
  });
  if (!healthy)
    return skipRest(
      [
        'connections',
        'collections',
        'list',
        'create',
        'read',
        'update',
        'verify',
        'delete',
        'gone',
      ],
      'gateway not healthy',
    );

  const connections = await run('connections', async () => {
    const list = await cms.connections();
    if (list.length === 0) throw new Error('the token sees no connections');
    return {
      value: list,
      detail: list.map((c) => `${c.name} (${c.mode})`).join(', '),
    };
  });
  if (!connections)
    return skipRest(
      [
        'collections',
        'list',
        'create',
        'read',
        'update',
        'verify',
        'delete',
        'gone',
      ],
      'needs connections',
    );

  // Prefer the connection chosen in the UI; for writes, one that is read_write.
  const chosen =
    connections.find((c) => c.id === preferred.connectionId) ?? connections[0]!;
  const writable: ConnectionInfo | undefined =
    chosen.mode === 'read_write'
      ? chosen
      : connections.find((c) => c.mode === 'read_write');
  const reading = chosen;

  const collections = await run('collections', async () => {
    const list = await cms.collections(reading.id);
    if (list.length === 0)
      throw new Error(`"${reading.name}" has no collections`);
    return {
      value: list,
      detail: `${reading.name}: ${list.map((c) => c.name).join(', ')}`,
    };
  });
  if (!collections)
    return skipRest(
      ['list', 'create', 'read', 'update', 'verify', 'delete', 'gone'],
      'needs collections',
    );

  await run('list', async () => {
    const target =
      collections.find((c) => c.name === preferred.collection) ??
      collections[0]!;
    const page = await cms
      .collection(reading.id, target.name)
      .query()
      .limit(5)
      .list();
    return {
      value: page,
      detail: `${target.name}: ${page.data.length} record(s), next cursor ${page.nextCursor ? 'yes' : 'no'}`,
    };
  });

  if (!writable) {
    return skipRest(
      ['create', 'read', 'update', 'verify', 'delete', 'gone'],
      'no read_write connection: writes skipped',
    );
  }

  // Find a collection on the writable connection where we can invent a valid record.
  const writeCollections =
    writable.id === reading.id
      ? collections
      : await cms.collections(writable.id).catch(() => []);
  const scratch = pickScratch(writeCollections, preferred.collection);
  if (!scratch)
    return skipRest(
      ['create', 'read', 'update', 'verify', 'delete', 'gone'],
      'no collection with simple required fields',
    );

  const handle = cms.collection(writable.id, scratch.name);
  const fields = fieldsOf(scratch);
  const pk = primaryKeyOf(fields) ?? 'id';
  const stamp = Date.now().toString(36);
  const values = scratchValues(fields, stamp);

  const created = await run('create', async () => {
    const record = await handle.create(values);
    const id = record[pk];
    if (id === undefined || id === null)
      throw new Error(`created record has no "${pk}"`);
    return {
      value: { id: String(id) },
      detail: `${writable.name}/${scratch.name} ${pk}=${String(id)}`,
    };
  });
  if (!created)
    return skipRest(
      ['read', 'update', 'verify', 'delete', 'gone'],
      'create failed',
    );
  const { id } = created;

  try {
    const read = await run('read', async () => {
      const record = await handle.get(id);
      for (const [key, expected] of Object.entries(values)) {
        if (JSON.stringify(record[key]) !== JSON.stringify(expected)) {
          throw new Error(
            `field "${key}" came back as ${JSON.stringify(record[key])}, expected ${JSON.stringify(expected)}`,
          );
        }
      }
      return { value: record, detail: 'all fields match what was sent' };
    });
    if (!read) return skipRest(['update', 'verify'], 'read failed');

    const patch = scratchPatch(fields, values);
    const updated = await run('update', async () => {
      const record = await handle.update(id, patch);
      return {
        value: record,
        detail: `changed ${Object.keys(patch).join(', ')}`,
      };
    });
    if (updated) {
      await run('verify', async () => {
        const record = await handle.get(id);
        for (const [key, expected] of Object.entries(patch)) {
          if (JSON.stringify(record[key]) !== JSON.stringify(expected)) {
            throw new Error(
              `"${key}" is ${JSON.stringify(record[key])}, expected ${JSON.stringify(expected)}`,
            );
          }
        }
        return { value: record, detail: 'new value is stored' };
      });
    } else {
      skipRest(['verify'], 'update failed');
    }
  } finally {
    // Always try to remove the scratch record, even after a failure above.
    const deleted = await run('delete', async () => {
      await handle.delete(id);
      return { value: true, detail: `${pk}=${id} removed` };
    });
    if (deleted) {
      set('gone', 'running');
      try {
        await handle.get(id);
        set('gone', 'fail', 'the record can still be read');
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'NOT_FOUND') set('gone', 'pass', 'NOT_FOUND, as expected');
        else set('gone', 'fail', errorLine(error));
      }
    } else {
      skipRest(['gone'], 'delete failed');
    }
  }
}

// Prefer a collection named like a scratch area, then the open one, then any usable one.
function pickScratch(
  list: CollectionInfo[],
  open: string,
): CollectionInfo | undefined {
  const usable = list.filter((c) => canInvent(fieldsOf(c)));
  const scratchy = usable.find((c) =>
    /scratch|selfcheck|self_check|test/i.test(c.name),
  );
  return scratchy ?? usable.find((c) => c.name === open) ?? usable[0];
}

// True when every required, editable field is of a type we can fill in.
function canInvent(fields: FieldInfo[]): boolean {
  return fields
    .filter((f) => f.required && isEditable(f))
    .every((f) => inventable(f));
}

function inventable(field: FieldInfo): boolean {
  return !['reference', 'binary', 'geopoint'].includes(field.type);
}

// A valid value for each required editable field (optional fields are left out).
function scratchValues(fields: FieldInfo[], stamp: string): RecordData {
  const values: RecordData = {};
  for (const field of fields) {
    if (!field.required || !isEditable(field)) continue;
    values[field.name] = valueFor(field, `selfcheck-${stamp}`);
  }
  return values;
}

function valueFor(field: FieldInfo, text: string): unknown {
  const rules = field.validation ?? {};
  switch (fieldKind(field.type)) {
    case 'number':
      return field.type === 'decimal'
        ? (rules.min ?? 1)
        : Math.max(1, Math.ceil(rules.min ?? 1));
    case 'boolean':
      return true;
    case 'date':
      return new Date().toISOString().slice(0, 10);
    case 'datetime':
      return new Date().toISOString();
    case 'json':
      return field.type === 'array' ? [] : { selfCheck: true };
    default: {
      if (rules.enum && rules.enum.length > 0) return rules.enum[0];
      let value = text;
      if (rules.pattern && !new RegExp(rules.pattern).test(value))
        value = `Self check ${text}`;
      return rules.maxLength ? value.slice(0, rules.maxLength) : value;
    }
  }
}

// A change to a field we filled: tweak a free-text field, else flip a boolean.
function scratchPatch(fields: FieldInfo[], values: RecordData): RecordData {
  for (const field of fields) {
    const current = values[field.name];
    const rules = field.validation ?? {};
    if (
      typeof current === 'string' &&
      ['string', 'text'].includes(field.type) &&
      !rules.enum
    ) {
      const next = `${current}-upd`;
      if (
        (!rules.maxLength || next.length <= rules.maxLength) &&
        (!rules.pattern || new RegExp(rules.pattern).test(next))
      ) {
        return { [field.name]: next };
      }
    }
  }
  for (const field of fields) {
    if (typeof values[field.name] === 'boolean')
      return { [field.name]: !values[field.name] };
  }
  // Nothing safe to change among required fields: write the same values again.
  return { ...values };
}
