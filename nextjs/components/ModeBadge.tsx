/** Shows whether a connection is read_only or read_write. */
export function ModeBadge({ mode }: { mode: string }) {
  return (
    <span className={mode === 'read_only' ? 'badge ro' : 'badge rw'}>
      {mode}
    </span>
  );
}
