/**
 * Demonstrates the live feed: a small client component listens to the
 * same-origin /api/events proxy and lists change events as they happen.
 */
import { LiveFeed } from '@/components/LiveFeed';

export default function LivePage() {
  return (
    <>
      <h1>Live feed</h1>
      <p className="muted">
        Events from the gateway (<span className="code">/v1/events</span>),
        relayed by <span className="code">/api/events</span>. Make a change in
        another tab and it shows up here. Events carry ids only, never field
        values.
      </p>
      <LiveFeed />
    </>
  );
}
