/**
 * Demonstrates the self-check page: runs health, connections, collections and
 * a create/read/update/delete round trip on a scratch record, showing
 * pass / fail / skip for every step. Runs only when asked (?run=1) because it
 * writes to the gateway.
 */
import { ErrorBox } from '@/components/ErrorBox';
import { runSelfCheck } from '@/lib/selfcheck';

export const dynamic = 'force-dynamic';

export default async function SelfCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const run = one(sp['run']) === '1';
  const connection = one(sp['connection']);
  const collection = one(sp['collection']);
  const result = run
    ? await runSelfCheck({
        ...(connection ? { connection } : {}),
        ...(collection ? { collection } : {}),
      })
    : null;

  return (
    <>
      <h1>Self-check</h1>
      <p className="muted">
        Runs on the server with the SDK. On a writable connection it creates a
        scratch record, reads, updates and deletes it. Nothing is left behind.
      </p>
      <form method="get" className="toolbar">
        <input type="hidden" name="run" value="1" />
        <label>
          Connection id (optional)
          <input name="connection" defaultValue={connection ?? ''} />
        </label>
        <label>
          Collection (optional)
          <input name="collection" defaultValue={collection ?? ''} />
        </label>
        <button type="submit">Run self-check</button>
      </form>
      {result ? (
        <>
          <p data-testid="summary" className={result.ok ? 'pass' : 'fail'}>
            {result.ok ? 'ALL STEPS PASSED' : 'SOMETHING FAILED'}
            {result.target
              ? ` (target: ${result.target.connection} / ${result.target.collection})`
              : ''}
          </p>
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Result</th>
                <th>Detail</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {result.steps.map((s, i) => (
                <tr key={i} data-step={s.name} data-status={s.status}>
                  <td>{s.name}</td>
                  <td className={s.status}>{s.status.toUpperCase()}</td>
                  <td>{s.error ? <ErrorBox error={s.error} /> : s.detail}</td>
                  <td>{s.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <p className="muted">
        The same checks as JSON:{' '}
        <span className="code">
          curl -X POST http://localhost:3000/api/self-check
        </span>
      </p>
    </>
  );
}
