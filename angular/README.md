# SethuCMS Angular example

A small test UI that exercises the SethuCMS gateway from **Angular 21** (standalone components, signals, zoneless, TypeScript). It uses the real SDK, `@sethucms/sdk`, wrapped in one injectable service (`src/app/sethu.service.ts`). Read that file first: it shows how to use the SDK from Angular.

This is a standalone project (npm, its own lockfile). It is **not** part of the pnpm workspace.

> Angular 21.2.24 is pinned, not Angular 22: the Angular 22 CLI needs Node 22.22.3 or newer, and this was built and verified on Node 22.22.0. Needs Node 20.19+, 22.12+ or 24+.

## Run it

1. **Build the SDK** (once). The example installs it from `../../sethucms-sdk-ts` and uses its `dist/`:

   ```sh
   cd ~/sethucms-sdk-ts
   npm install        # or: pnpm install at the repo root
   npm run build
   ```

2. **Start the gateway** (see `QUICKSTART.md`) and note the admin token printed on first start:

   ```sh
   cd ~/sethucms && SETHUCMS_ALLOWED_ORIGINS=http://localhost:4200 sh scripts/run-local.sh
   ```

   It listens on `http://127.0.0.1:8080` and has a "Demo content" connection (authors, articles).

3. **Install and start the example:**

   ```sh
   cd ~/sethucms-examples/angular
   npm install
   npm start          # ng serve on http://localhost:4200
   ```

4. Open <http://localhost:4200>, paste the admin token into **Bearer token**, press **Connect**.

Other commands: `npm run build` (production build into `dist/`), `npm run typecheck`.

## Two ways to reach the gateway

**A. Direct (default).** The page at `http://localhost:4200` calls the gateway at `http://127.0.0.1:8080` itself. That is a cross-origin call, so the gateway must allow the origin:

```sh
cd ~/sethucms && SETHUCMS_ALLOWED_ORIGINS=http://localhost:4200 sh scripts/run-local.sh
```

The origin must match exactly (scheme, host, port). `http://127.0.0.1:4200` is a different origin from `http://localhost:4200`.

**B. Through the dev-server proxy (no CORS needed).** `proxy.conf.json` forwards `/v1/*` from the dev server to `http://127.0.0.1:8080`:

```sh
npm run start:proxy        # same as: ng serve --proxy-config proxy.conf.json
```

Then set **Gateway URL** to `http://localhost:4200` (the page's own address). The browser now sees one origin. Edit `target` in `proxy.conf.json` if your gateway runs on another port. The proxy also carries the live-feed stream.

## What each panel shows

- **Settings bar.** Gateway URL, bearer token, a **Connect** button and a health light (green = `GET /v1/health` answers, re-checked every 15 s). Settings are kept in memory and `sessionStorage` (gone when the tab closes). The token is never written to `localStorage`.
- **Pickers.** The connections your token can see and the collections of the chosen one. The badge shows `read_only` or `read_write`.
- **Records table.** One page of records from `collection.query()...list()`. Click a column header to sort (asc, desc, off). The filter row builds one condition with the SDK helpers (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`); the value is sent as a number for number fields. **Next/Previous** walk the cursor pages (set page size 2 to see it with the demo data). "Server note" lines are `capabilityNotes` from the gateway. Click a row to edit it.
- **Record form.** Generated from the collection's fields: text for `string`, textarea for `text`, number for `integer`/`decimal`, checkbox for `boolean`, date pickers for `date`/`datetime`, a JSON textarea for `json`/`array`/`geopoint`, plain text for anything else (a numeric `reference` is sent as a number). Primary keys are shown but not sent. A failed call shows the `SethuApiError` as `CODE: message (HTTP status, request id)` plus any `details`. On a `read_only` connection the form is disabled and **New record** is off.
- **Live feed.** Events from `GET /v1/events` (`record.created`, `record.updated`, `record.deleted`, draft events). The chip shows `connecting`, `live`, `error` (retrying with back-off) or `off`. When an event names the open collection, the table reloads by itself (try a change made with `curl`, or from the admin app). Events carry ids only, never field values.
- **Self-check** (second tab). **Run self-check** runs, in order: health, list connections, list collections, list records, create a scratch record, read it, update it, delete it, confirm it is gone (`NOT_FOUND`). Each step shows PASS, FAIL or SKIP. The create/update/delete steps are skipped when no connection is `read_write`. A failed step stops the chain and the scratch record is deleted if it was created.

## How it is built

- `sethu.service.ts`: `SethuService` (`providedIn: 'root'`). One `SethuClient`, built from the URL signal; the token is passed as a function so edits apply on the next request. State (health, connections, collections, selection, feed) is exposed as signals. `describeError()` formats `SethuApiError`.
- `util/sse.ts`: the live feed as an RxJS `Observable`. The gateway reads the token **only from the `Authorization` header**, and the browser `EventSource` cannot send headers, so this uses `fetch` streaming and parses the SSE framing. Unsubscribing aborts the request; the service retries with back-off, except on 401/403.
- `util/fields.ts`: field type to form control mapping.
- `components/` and `pages/`: standalone components with signals and inline templates; each file starts with a comment saying what it demonstrates.

## Troubleshooting

- **Health light is red / "Cannot reach the gateway".** Is the gateway running at that URL and port? `curl http://127.0.0.1:8080/v1/health`. Plain `http` is only accepted by the SDK for `localhost`, `127.0.0.1` and `[::1]`; other hosts need `https`.
- **CORS error in the browser console** (`blocked by CORS policy`, or "Could not reach the server" although curl works). Restart the gateway with `SETHUCMS_ALLOWED_ORIGINS=http://localhost:4200` (exact origin, comma separated for several), or use the proxy option above. Open the page on the same host name you allowed.
- **401 / `AUTH_FAILED`.** The token is wrong, expired or has stray spaces. The first-start admin token is printed once; to use your own, set `SETHUCMS_ADMIN_TOKEN`. A 403 / `FORBIDDEN` means the token's role may not do that.
- **Live feed stays `connecting`/`error`.** Read the red message in the feed panel. 401 stops retrying: fix the token and press Connect. Through your own reverse proxy, turn response buffering off for `/v1/events` (the gateway sends `X-Accel-Buffering: no`). The gateway limits open streams per token (`RATE_LIMITED`); close other tabs. Press **Reconnect** after a gateway restart if you do not want to wait for the retry.
- **Empty collection list.** Only collections the connection exposes and your role may read are listed. Expose them in the admin app.
- **`npm install` cannot find the SDK or the build says it cannot resolve `@sethucms/sdk`.** Build the SDK first (step 1). The package is a symlink to `~/sethucms-sdk-ts`; re-run `npm install` after moving the folders.
- **Create fails with `VALIDATION_FAILED`.** The gateway validates records (required fields, patterns such as a slug `^[a-z0-9-]+$`, ranges). The error details show what it rejected.

## Production note

The token in this example sits in browser memory and `sessionStorage`, so any script on the page can read it. That is fine for a local test and **wrong for production**. Do not ship a gateway token in browser code. Keep it on a backend (or a thin proxy) that authenticates your users, adds `Authorization: Bearer ...` itself, and forwards only the calls your app needs. Then the browser talks only to your own origin.
