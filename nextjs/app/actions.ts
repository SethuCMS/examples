'use server';

/**
 * Demonstrates Server Actions: create, update and delete a record through the
 * SDK. The forms run in the browser, but these functions (and the token) run
 * only on the server. Errors come back as plain data, never as exceptions.
 */
import { redirect } from 'next/navigation';
import { getClient } from '@/lib/sethu';
import { toErrorInfo } from '@/lib/errors';
import {
  FieldParseError,
  parseInput,
  primaryKeyOf,
  type FieldInfo,
} from '@/lib/fields';
import type { FormState } from '@/lib/form-state';

/** Read the text of every field input (`f_<name>`) out of the form. */
function rawValues(
  fields: FieldInfo[],
  form: FormData,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = form.get(`f_${f.name}`);
    out[f.name] = typeof v === 'string' ? v : '';
  }
  return out;
}

async function save(
  connectionId: string,
  collection: string,
  recordId: string | null,
  prev: FormState,
  form: FormData,
): Promise<FormState> {
  const nonce = prev.nonce + 1;
  let target: string;
  try {
    const cms = getClient();
    const info = (await cms.collections(connectionId)).find(
      (c) => c.name === collection,
    );
    if (!info) {
      return {
        nonce,
        error: { code: 'NOT_FOUND', message: `No collection "${collection}"` },
      };
    }
    const pk = primaryKeyOf(info.fields);
    const raw = rawValues(info.fields, form);
    const values: Record<string, unknown> = {};
    for (const field of info.fields) {
      if (recordId !== null && field.name === pk) continue; // never edit the key
      const value = parseInput(
        field,
        raw[field.name] ?? '',
        recordId === null ? 'create' : 'update',
      );
      if (value !== undefined) values[field.name] = value;
    }
    const handle = cms.collection(connectionId, collection);
    const saved =
      recordId === null
        ? await handle.create(values)
        : await handle.update(recordId, values);
    const id = String(saved[pk] ?? recordId ?? '');
    target = `/c/${encodeURIComponent(connectionId)}/${encodeURIComponent(collection)}?notice=${encodeURIComponent(
      `${recordId === null ? 'Created' : 'Saved'} record ${id}`,
    )}`;
  } catch (e) {
    const values = form
      ? Object.fromEntries(
          [...form.entries()]
            .filter(([k, v]) => k.startsWith('f_') && typeof v === 'string')
            .map(([k, v]) => [k.slice(2), v as string]),
        )
      : {};
    return {
      nonce,
      values,
      error:
        e instanceof FieldParseError
          ? { code: 'VALIDATION_FAILED', message: e.message }
          : toErrorInfo(e),
    };
  }
  redirect(target); // outside try/catch: redirect works by throwing
}

export async function createRecord(
  connectionId: string,
  collection: string,
  prev: FormState,
  form: FormData,
): Promise<FormState> {
  return save(connectionId, collection, null, prev, form);
}

export async function updateRecord(
  connectionId: string,
  collection: string,
  recordId: string,
  prev: FormState,
  form: FormData,
): Promise<FormState> {
  return save(connectionId, collection, recordId, prev, form);
}

export async function deleteRecord(
  connectionId: string,
  collection: string,
  recordId: string,
  prev: FormState,
): Promise<FormState> {
  const nonce = prev.nonce + 1;
  try {
    await getClient().collection(connectionId, collection).delete(recordId);
  } catch (e) {
    return { nonce, error: toErrorInfo(e) };
  }
  redirect(
    `/c/${encodeURIComponent(connectionId)}/${encodeURIComponent(collection)}?notice=${encodeURIComponent(`Deleted record ${recordId}`)}`,
  );
}
