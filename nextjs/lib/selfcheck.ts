/**
 * Demonstrates an end-to-end check of the gateway through the SDK, run on the
 * server: health, connections, collections, then create / read / update /
 * delete of a scratch record (only on a writable connection). Each step
 * reports pass, fail or skip. The scratch record is removed even if a middle
 * step fails.
 */
import 'server-only';
import type { CollectionInfo, ConnectionInfo } from '@sethucms/sdk';
import { toErrorInfo, type ErrorInfo } from './errors';
import { getClient } from './sethu';
import { kindOf, primaryKeyOf, type FieldInfo } from './fields';

export interface Step {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
  ms: number;
  error?: ErrorInfo;
}

export interface SelfCheckResult {
  ok: boolean;
  steps: Step[];
  target?: { connection: string; collection: string };
}

/** Values for the required fields of a collection, or null when we cannot fill one. */
function scratchValues(
  fields: FieldInfo[],
  tag: string,
): { values: Record<string, unknown>; textField: string | null } | null {
  const values: Record<string, unknown> = {};
  let textField: string | null = null;
  for (const f of fields) {
    if (f.primaryKey || !f.required) continue;
    switch (kindOf(f.type)) {
      case 'string':
      case 'text':
        values[f.name] = tag;
        textField ??= f.name;
        break;
      case 'number':
        values[f.name] = 1;
        break;
      case 'boolean':
        values[f.name] = false;
        break;
      case 'date':
        values[f.name] = '2026-01-01';
        break;
      case 'datetime':
        values[f.name] = '2026-01-01T00:00:00.000Z';
        break;
      case 'json':
        values[f.name] = {};
        break;
      default:
        return null; // e.g. a required reference: cannot invent a valid one
    }
  }
  if (textField === null) {
    // Nothing required to edit: use any optional text field for the update step.
    textField =
      fields.find((f) => !f.primaryKey && kindOf(f.type) === 'string')?.name ??
      null;
  }
  return { values, textField };
}

export async function runSelfCheck(
  pick: { connection?: string; collection?: string } = {},
): Promise<SelfCheckResult> {
  const steps: Step[] = [];
  const result: SelfCheckResult = { ok: false, steps };

  // Run one step, timing it and converting a throw into a failed step.
  async function step<T>(
    name: string,
    fn: () => Promise<{ detail: string; value?: T; skip?: boolean }>,
  ): Promise<T | undefined> {
    const started = Date.now();
    try {
      const out = await fn();
      steps.push({
        name,
        status: out.skip ? 'skip' : 'pass',
        detail: out.detail,
        ms: Date.now() - started,
      });
      return out.value;
    } catch (e) {
      const error = toErrorInfo(e);
      steps.push({
        name,
        status: 'fail',
        detail: `${error.code}: ${error.message}`,
        ms: Date.now() - started,
        error,
      });
      return undefined;
    }
  }
  const skip = (name: string, detail: string) =>
    steps.push({ name, status: 'skip', detail, ms: 0 });
  const finish = (): SelfCheckResult => {
    result.ok = steps.every((s) => s.status !== 'fail');
    return result;
  };

  let cms;
  try {
    cms = getClient();
  } catch (e) {
    const error = toErrorInfo(e);
    steps.push({
      name: 'Configuration',
      status: 'fail',
      detail: `${error.code}: ${error.message}`,
      ms: 0,
      error,
    });
    return finish();
  }

  const healthy = await step('Health', async () => {
    if (!(await cms.isHealthy())) {
      throw Object.assign(new Error('Gateway did not answer /v1/health'), {
        name: 'SethuApiError',
        code: 'CONNECTION_FAILED',
        status: 0,
      });
    }
    return { detail: 'GET /v1/health is ok', value: true };
  });
  if (!healthy) return finish();

  const connections = await step('List connections', async () => {
    const list = await cms.connections();
    return {
      detail: `${list.length} connection(s): ${list.map((c) => `${c.name} (${c.mode})`).join(', ') || 'none'}`,
      value: list,
    };
  });
  if (!connections) return finish();

  // Choose the connection: the requested one, else the first writable, else the first.
  const connection: ConnectionInfo | undefined = pick.connection
    ? connections.find((c) => c.id === pick.connection)
    : (connections.find((c) => c.mode === 'read_write') ?? connections[0]);
  if (!connection) {
    steps.push({
      name: 'Pick connection',
      status: 'fail',
      detail: pick.connection
        ? `No connection with id ${pick.connection}`
        : 'The token sees no connections',
      ms: 0,
    });
    return finish();
  }

  const collections = await step('List collections', async () => {
    const list = await cms.collections(connection.id);
    return {
      detail: `${list.length} collection(s) in "${connection.name}": ${list.map((c) => c.name).join(', ') || 'none'}`,
      value: list,
    };
  });
  if (!collections) return finish();

  // Choose a collection we can write to: the requested one, else the first we can fill in.
  const tag = `selfcheck-${Date.now()}`;
  let chosen: CollectionInfo | undefined;
  let plan: ReturnType<typeof scratchValues> = null;
  for (const c of collections) {
    if (pick.collection && c.name !== pick.collection) continue;
    const p = scratchValues(c.fields, tag);
    if (p) {
      chosen = c;
      plan = p;
      break;
    }
  }
  if (!chosen || !plan) {
    skip(
      'Create scratch record',
      'No collection with fields this check can fill in',
    );
    skip('Read', 'nothing to read');
    skip('Update', 'nothing to update');
    skip('Delete', 'nothing to delete');
    return finish();
  }
  result.target = { connection: connection.id, collection: chosen.name };

  if (connection.mode === 'read_only') {
    skip('Create scratch record', `"${connection.name}" is read-only`);
    // A read-only connection can still be read: fetch the first record if any.
    await step('Read', async () => {
      const page = await cms
        .collection(connection.id, chosen.name)
        .query()
        .limit(1)
        .list();
      return {
        detail: `read ${page.data.length} record(s) from ${chosen.name} (list works)`,
      };
    });
    skip('Update', 'read-only connection');
    skip('Delete', 'read-only connection');
    return finish();
  }

  const pk = primaryKeyOf(chosen.fields);
  const handle = cms.collection(connection.id, chosen.name);
  let createdId: string | undefined;

  try {
    const created = await step('Create scratch record', async () => {
      const row = await handle.create(plan.values);
      const id = String(row[pk] ?? '');
      if (!id) throw new Error(`The new record has no "${pk}" value`);
      createdId = id;
      return { detail: `created ${chosen.name}/${id}`, value: row };
    });
    if (!created || !createdId) {
      skip('Read', 'create failed');
      skip('Update', 'create failed');
      skip('Delete', 'create failed');
      return finish();
    }
    const id = createdId;

    await step('Read', async () => {
      const row = await handle.get(id);
      for (const [k, v] of Object.entries(plan.values)) {
        if (JSON.stringify(row[k]) !== JSON.stringify(v)) {
          throw new Error(
            `Field "${k}" came back as ${JSON.stringify(row[k])}`,
          );
        }
      }
      return { detail: `read back ${chosen.name}/${id}; values match` };
    });

    if (plan.textField) {
      const field = plan.textField;
      const updatedValue = `${tag}-u`;
      await step('Update', async () => {
        const row = await handle.update(id, { [field]: updatedValue });
        const again = await handle.get(id);
        if (row[field] !== updatedValue || again[field] !== updatedValue) {
          throw new Error(`"${field}" was not changed`);
        }
        return { detail: `set ${field} to "${updatedValue}" and read it back` };
      });
    } else {
      skip('Update', 'no text field to change');
    }
  } finally {
    // Always clean up the scratch record, even if an earlier step failed.
    if (createdId) {
      const id = createdId;
      await step('Delete', async () => {
        await handle.delete(id);
        return { detail: `deleted ${chosen.name}/${id}` };
      });
      await step('Verify gone', async () => {
        try {
          await handle.get(id);
        } catch (e) {
          if ((e as { code?: string }).code === 'NOT_FOUND') {
            return { detail: 'record is gone (NOT_FOUND)' };
          }
          throw e;
        }
        throw new Error('The record still exists after delete');
      });
    }
  }
  return finish();
}
