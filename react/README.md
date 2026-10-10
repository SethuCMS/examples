# SethuCMS React test UI

A small React + Vite + TypeScript app that exercises a SethuCMS gateway
through the TypeScript SDK (`@sethucms/sdk`). Use it to check that SethuCMS
works from a React front end: connections, collections, records (list, sort,
filter, page, create, edit, delete), the live change stream, and a one-click
self-check.

It is a standalone project. It is not part of the pnpm workspace and has its
own `package.json` and `package-lock.json`. The SDK is consumed as a file
dependency (`"@sethucms/sdk": "file:../../sethucms-sdk-ts"`).

## Steps

Run these from the repository root (`sethucms/`) unless a `cd` says otherwise.

1. Build the SDK and the gateway (once). `sh scripts/build-all.sh` builds
   everything; the minimum for this app is:

   ```sh
   cd ~/sethucms-sdk-ts && pnpm install && pnpm build
   ```

   The gateway also needs to be built (`~/sethucms/apps/api/dist/src/main.js` must exist).
   If it is not, run `sh scripts/build-all.sh`.

2. Start the gateway, allowing this app's origin. The gateway only answers
   browser calls from origins it is told about:

   ```sh
   cd ~/sethucms && SETHUCMS_ALLOWED_ORIGINS=http://localhost:5173 sh scripts/run-local.sh
   ```

   (`run-local.sh` also needs the admin app built; if you skip it, start the
   gateway directly instead:
   `cd ~/sethucms/apps/api && SETHUCMS_ALLOWED_ORIGINS=http://localhost:5173 node dist/src/main.js`.)

   On the first start with a new data folder the gateway prints an admin token,
   once:

   ```
   First start: an admin token was created. It is shown only once.
   ADMIN TOKEN:           adb_...
   ```

   Copy it. To choose your own token, set `SETHUCMS_ADMIN_TOKEN` (32 to 200
   characters). Locally the gateway also creates a "Demo content" connection
   (in-memory `authors` and `articles`), which this app can use as is.

3. Install and start the app:

   ```sh
   cd ~/sethucms-examples/react
   npm install
   npm run dev
   ```

4. Open **http://localhost:5173** (use `localhost`, exactly as listed in
   `SETHUCMS_ALLOWED_ORIGINS`; `127.0.0.1:5173` is a different origin).
   Leave the gateway URL at `http://127.0.0.1:8080`, paste the token, and press
   **Run self-check**.

Other commands: `npm run build` (type-check and production build),
`npm run typecheck`.

## Using the Vite proxy instead of CORS

If you would rather not configure CORS, type `/api` as the gateway URL. The dev
server forwards `/api/*` to the gateway, so the browser only talks to
`localhost:5173`. Point the proxy at your gateway with `GATEWAY_URL`
(default `http://127.0.0.1:8080`):

```sh
GATEWAY_URL=http://127.0.0.1:8081 npm run dev
```

The proxy only exists in `npm run dev`, not in the built app.

## What each panel demonstrates

| Panel | Shows |
| --- | --- |
| Settings bar | `new SethuClient({ baseUrl, token })`; `cms.isHealthy()` as the green/red indicator (re-checked every 10 s). The token lives in React state and `sessionStorage` (cleared when the tab closes), never `localStorage`. |
| Connection and collection | `cms.connections()` and `cms.collections(id)`. The badge shows `read_only` or `read_write`. |
| Records | The query builder: `.orderBy()` (click a column header: asc, desc, off), `.where()` with the SDK filter helpers (`eq`, `ne`, `contains`, `startsWith`, `gt`, `gte`, `lt`, `lte`), `.limit()`, `.after(cursor)` and `nextCursor` for Next / Previous. The filter that was sent is shown under the box. Server notes (`capabilityNotes`) are shown when present. |
| New / Edit record | A form generated from the collection's field list. `string`, `text`, `number` (`integer`, `decimal`), `boolean`, `date`, `datetime` and `json` have their own inputs; anything else is a text box. `collection.create`, `.update` and `.delete`. Failed calls show the `SethuApiError` code, message, HTTP status and request id. Writes are disabled on `read_only` connections and when the token's role may not write. Try a slug like `BAD SLUG` in `articles` to see `VALIDATION_FAILED`. |
| Live feed | The gateway change stream, `GET /v1/events` (Server-Sent Events). When a record event arrives for the open collection, the table reloads. **Poll /v1/changes** shows the resumable change log (`GET /v1/changes`) behind the same events. |
| Self-check | Health, list connections, list collections, list records, then (if a connection is `read_write`) create a record, read it, update it, read the update, delete it, and confirm it is gone. Each step shows pass, fail or skipped. |

Notes on the self-check: the SDK cannot create collections, so the "scratch"
record goes into an existing collection of a writable connection. It prefers a
collection whose name contains `scratch`, `selfcheck` or `test`, then the
collection open in the table, then the first collection whose required fields
are simple enough to fill in. The record is deleted at the end, even if an
earlier step failed. Run it against a development database only.

## How the live feed authenticates

`GET /v1/events` needs `Authorization: Bearer <token>`, the same as every other
call (there is no token-in-URL option). The browser's `EventSource` cannot send
headers, so `src/lib/events.ts` reads the stream with `fetch()` and decodes the
SSE text itself. It reconnects after 3 seconds if the stream drops, and stops
when the gateway answers 401 or 403. Events carry ids only (connection,
collection, record id), never field values; the table reloads to see the data.
Only changes made through the gateway are announced, not changes made directly
in the database.

## Troubleshooting

- **Health shows "unreachable", or the console says CORS / "Failed to fetch".**
  The gateway is not running at that address, or it does not allow this page's
  origin. Start it with `SETHUCMS_ALLOWED_ORIGINS=http://localhost:5173`, and
  open the app at `http://localhost:5173` (not `127.0.0.1:5173`). The check
  `curl -i -H 'Origin: http://localhost:5173' http://127.0.0.1:8080/v1/health`
  should show an `Access-Control-Allow-Origin` header. Or use `/api` (proxy).
- **Health is green but you see `AUTH_FAILED` (HTTP 401).** The health route
  needs no token; everything else does. The token is wrong, mistyped, or from
  a different data folder. The admin token is printed only on the first start
  of a data folder. To get a fresh one, stop the gateway, use a new
  `SETHUCMS_DATA_DIR` (or set `SETHUCMS_ADMIN_TOKEN` yourself) and start again.
- **`FORBIDDEN`.** The token is valid but its role may not do that.
- **Live feed says `error` / "HTTP 401: the token was refused".** Same as 401
  above; the feed does not retry until the token changes.
- **Live feed stays `connecting` or keeps reconnecting.** Something between the
  browser and the gateway is buffering the stream (a proxy or tunnel). Direct
  access and the Vite proxy both stream. Events only appear when something
  changes: create or edit a record, or use the Self-check, and an entry shows.
  The gateway sends a `ready` event when the stream opens.
- **Too many open event streams (`RATE_LIMITED`).** The gateway limits streams
  per token. Close other tabs using the feed.
- **"Invalid URL" under the settings bar.** The SDK accepts `https://` addresses,
  and `http://` only for `localhost` / `127.0.0.1`.
- **Self-check "no read_write connection: writes skipped".** Every connection
  the token sees is `read_only`. Reads were still checked.
- **Port 5173 is busy.** `vite.config.ts` uses `strictPort`, so it stops
  instead of choosing another port (which the gateway would refuse). Free the
  port, or change it in `vite.config.ts` and in `SETHUCMS_ALLOWED_ORIGINS`.
- **`Cannot find module '@sethucms/sdk'`.** The SDK is not built. Run
  `pnpm build` in `~/sethucms-sdk-ts`, then `npm install` here again.

## Layout

```
src/lib/        gateway.ts (client + error helpers), fields.ts (field types),
                events.ts (SSE over fetch), selfcheck.ts, describe.ts, useAsync.ts
src/components/ SettingsBar, Pickers, RecordsTable, RecordForm, LiveFeed,
                SelfCheck, ErrorBanner
```
