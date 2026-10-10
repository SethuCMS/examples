/**
 * Explains in five lines why this app calls the gateway from the server.
 */
export default function WhyPage() {
  return (
    <>
      <h1>Why server-side?</h1>
      <ol>
        <li>
          The gateway token is a password. Anything in browser JavaScript can be
          read by the visitor.
        </li>
        <li>
          So <span className="code">SETHUCMS_TOKEN</span> lives in server env
          (no <span className="code">NEXT_PUBLIC_</span> prefix) and only server
          code reads it.
        </li>
        <li>
          Pages are Server Components that call the SDK and send finished HTML;
          forms use Server Actions.
        </li>
        <li>
          The live feed goes through <span className="code">/api/events</span>,
          which adds the token and relays the stream.
        </li>
        <li>
          This test app has no login of its own: whoever can open it acts with
          the token, so keep it on localhost.
        </li>
      </ol>
    </>
  );
}
