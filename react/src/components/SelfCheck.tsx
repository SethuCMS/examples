import { useState } from 'react';
import type { SethuClient } from '@sethucms/sdk';
import { initialSteps, runSelfCheck, type Step } from '../lib/selfcheck';

/**
 * Self-check. One click runs the whole SDK round trip: health, list
 * connections and collections, then (if a connection is read_write) create,
 * read, update and delete a scratch record and confirm it is gone. Each step
 * shows pass / fail / skipped. This is the panel to click to confirm that
 * SethuCMS works from React.
 */
export function SelfCheck(props: {
  cms: SethuClient | null;
  connectionId: string;
  collection: string;
}) {
  const { cms, connectionId, collection } = props;
  const [steps, setSteps] = useState<Step[]>(initialSteps());
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const start = async (): Promise<void> => {
    if (!cms) return;
    setRunning(true);
    setDone(false);
    setSteps(initialSteps());
    try {
      await runSelfCheck(cms, { connectionId, collection }, (step) =>
        setSteps((list) => list.map((s) => (s.id === step.id ? step : s))),
      );
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  const count = (status: Step['status']): number =>
    steps.filter((s) => s.status === status).length;
  const failed = count('fail');
  return (
    <section className="panel">
      <h2>Self-check</h2>
      <button
        type="button"
        className="primary"
        onClick={() => void start()}
        disabled={!cms || running}
        data-testid="selfcheck"
      >
        {running ? 'Running...' : 'Run self-check'}
      </button>
      {done && (
        <div
          className={failed ? 'error' : 'success'}
          data-testid="selfcheck-summary"
        >
          {failed ? `${failed} step(s) failed` : 'All steps passed'} (
          {count('pass')} passed, {count('skip')} skipped)
        </div>
      )}
      <ul className="steps">
        {steps.map((s) => (
          <li key={s.id} data-testid={`step-${s.id}`} data-status={s.status}>
            <span className={`badge ${s.status}`}>{s.status}</span> {s.label}
            {s.detail && <div className="muted small">{s.detail}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
