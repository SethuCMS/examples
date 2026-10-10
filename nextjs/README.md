# SethuCMS from Next.js (test UI)

A small Next.js app (App Router, TypeScript, React 19) for checking that the SethuCMS gateway works from Next.js.

**The point:** the gateway token never reaches the browser. It lives in server env (`SETHUCMS_TOKEN`, no `NEXT_PUBLIC_` prefix) and only server code reads it: Server Components, Server Actions and Route Handlers. See the **Why server-side?** page in the app.

This is a standalone project (npm, its own lockfile). It is not part of the pnpm workspace. Pinned versions: Next.js 16.3.6, React 19.3.0, TypeScript 5.9.3. Needs Node 20.9 or newer.

## Steps

1. **Build the SDK once** (the app uses it from `../../sethucms-sdk-ts`, and `dist` must exist):

   ```sh
   cd ~/sethucms-sdk-ts
   npx tsc -p tsconfig.json      # or: pnpm --filter @sethucms/sdk build
   ```

2. **Start the gateway** (from the `sethucms` folder; build it first with `sh scripts/build-all.sh` if you have not):

   ```sh
   cd ~/sethucms && sh scripts/run-local.sh       # http://127.0.0.1:8080
   ```

   On the **first start** it prints `ADMIN TOKEN: adb_...` once. Copy it. (To use your own token, start with `SETHUCMS_ADMIN_TOKEN=<32-200 chars>`.) A "Demo content" connection with sample `authors` and `articles` is created for you.

3. **Configure the app:**

   ```sh
   cd ~/sethucms-examples/nextjs
   cp env.example .env.local
   # edit .env.local: set SETHUCMS_URL and SETHUCMS_TOKEN
   ```

4. **Install and run:**

   ```sh
   npm install
   npm run dev                   # http://localhost:3000
   ```

   Also works with `npm run build && npm start`. After changing `.env.local`, restart the server.

## Pages

| Page                           | What it shows                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                            | Connections (Server Component, `client.connections()`), with mode badge (read_only / read_write) and health.                                                                                                                                                                                                                                                                      |
| `/c/<connection>`              | Collections of a connection and their fields. Read-only banner.                                                                                                                                                                                                                                                                                                                   |
| `/c/<connection>/<collection>` | Records table, rendered on the server. Sort by clicking a header (`?sort=&dir=`), filter (`?ff=&fo=&fv=`), page size (`?limit=`), cursor paging (`?cursor=`). Edit and Delete per row. Gateway notes are shown under the table.                                                                                                                                                   |
| `.../new` and `.../<id>`       | Create and edit forms generated from the collection's field list: string, text, number (integer/decimal), boolean, date, datetime, json/array; anything else (reference, binary...) falls back to a text input. Submits to Server Actions.                                                                                                                                        |
| `/live`                        | Live change feed. A client component opens `EventSource('/api/events')` on the same origin; the route handler adds the token and relays the gateway's `/v1/events`. Open it in one tab, change a record in another.                                                                                                                                                               |
| `/self-check`                  | Click **Run self-check**: health, list connections, list collections, then on a writable connection create a scratch record, read, update, delete, and verify it is gone. Pass / fail / skip per step; the scratch record is removed even if a step fails. On a read-only connection the write steps are skipped. Optional `?connection=<id>&collection=<name>` picks the target. |
| `/api/self-check`              | The same checks as JSON: `curl -X POST http://localhost:3000/api/self-check` (POST only, it writes).                                                                                                                                                                                                                                                                              |
| `/why`                         | Five lines on why the calls are server-side.                                                                                                                                                                                                                                                                                                                                      |

Errors from the SDK are shown with code, message, HTTP status, request id, details and a hint (for example `READ_ONLY`, `AUTH_FAILED`, `VALIDATION_FAILED`).

## Files

- `lib/sethu.ts`: the only place the token is read (`server-only`).
- `lib/errors.ts`, `lib/fields.ts`, `lib/selfcheck.ts`: error display, field types and form parsing, the self-check.
- `app/actions.ts`: Server Actions for create, update, delete.
- `app/api/events/route.ts`: the live stream proxy. `app/api/self-check/route.ts`: JSON self-check.
- `components/`: the small client components (form, delete button, live feed) and display helpers.
- `next.config.ts`: `transpilePackages: ['@sethucms/sdk']` for the local file dependency.

## Check that the token stays server-side

```sh
npm run build
grep -r "<your token>" .next/static    # no output
```

or open the browser dev tools, Network tab: no request goes to the gateway, and the token is in no response.

## Troubleshooting

| You see                                                       | Cause and fix                                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG: SETHUCMS_URL is not set`                             | No `.env.local`, or the dev server was not restarted after editing it.                                                                                                |
| `CONNECTION_FAILED`                                           | Gateway not running, or wrong `SETHUCMS_URL`/port. Check `curl <url>/v1/health`.                                                                                      |
| `AUTH_FAILED` (HTTP 401)                                      | Wrong or truncated token. The first-start token is printed once; if lost, start the gateway with your own `SETHUCMS_ADMIN_TOKEN`, or use a fresh `SETHUCMS_DATA_DIR`. |
| `ERROR: baseUrl must use https`                               | Plain http is only accepted for localhost. Use https, or set `SETHUCMS_ALLOW_INSECURE_HTTP=true` (tokens then travel unencrypted).                                    |
| `READ_ONLY` (HTTP 403)                                        | The connection is read-only. Switch it to read_write in the SethuCMS admin app.                                                                                       |
| `VALIDATION_FAILED`                                           | A value broke a rule (for example the article `slug` must match `^[a-z0-9-]+$`). The details list the field.                                                          |
| Build says it cannot find `@sethucms/sdk` or its types        | The SDK is not built. Run step 1, then `npm install` again.                                                                                                           |
| Live feed says "reconnecting"                                 | The gateway is down, or it refused a further stream (`RATE_LIMITED`). Open `/api/events` directly to see the error as JSON.                                           |
| Sorting or filtering gives a "Gateway notes" line or an error | Not every database supports every operator or sort; the gateway says so in the notes.                                                                                 |
| Edits work in the table but no events appear                  | Events only cover changes that go through the gateway, not changes made directly in the database.                                                                     |

## Notes

- This app has no login of its own: anyone who can open it acts with the token. Run it on localhost only.
