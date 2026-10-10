/**
 * GET /v1/connections/:id/collections/:name returns more than the SDK's
 * `collections()` list: validation rules, which fields are editable and what
 * the caller may do (`access`). The SDK has no method for it yet, so this
 * calls the endpoint directly with the same bearer token.
 */
import type { CollectionInfo } from '@sethucms/sdk';
import type { FieldInfo } from './fields';

/** What the caller may do with records of this collection. */
export interface Access {
  create: boolean;
  update: boolean;
  delete: boolean;
}

/** The detailed description (only the parts this UI uses). */
export interface CollectionDetail {
  fields: FieldInfo[];
  access: Access;
}

/** Fetch the detail. Throws on any failure; callers fall back to the plain list. */
export async function describeCollection(
  baseUrl: string,
  token: string,
  info: CollectionInfo,
  connectionId: string,
  signal: AbortSignal,
): Promise<CollectionDetail> {
  const path = `/v1/connections/${encodeURIComponent(connectionId)}/collections/${encodeURIComponent(info.name)}`;
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { data: CollectionDetail };
  return body.data;
}
