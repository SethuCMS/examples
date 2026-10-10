# Plain HTML smoke test

One file (`index.html`), no build, no dependencies. It calls the gateway HTTP API with `fetch` and prints PASS / FAIL / SKIP per check.

## Serve it

```sh
npx serve -l 5500 ~/sethucms-examples/plain-html
# or
python3 -m http.server 5500 --directory ~/sethucms-examples/plain-html
```

Open http://localhost:5500. Do not open the file with `file://`: the browser sends `Origin: null`, which CORS will not allow.

## Gateway setup

The page runs on a different origin from the gateway, so the gateway must allow it:

```sh
cd ~/sethucms && SETHUCMS_ALLOWED_ORIGINS=http://localhost:5500 sh scripts/run-local.sh
```

The origin must match exactly (scheme, host, port). `localhost` and `127.0.0.1` are different origins.

## Token

On first start the gateway prints `ADMIN TOKEN: adb_...` once. Copy it from the start-up output. To use your own, start with `SETHUCMS_ADMIN_TOKEN` (32 to 200 characters of `A-Za-z0-9_-.`). Any API token with write access to a collection also works. The token is only kept in the page, never stored.

## Checks

| Check | Meaning |
| --- | --- |
| GET /v1/health | Gateway is up and CORS allows this page's origin (no token). Failing with "Failed to fetch" usually means a wrong URL or `SETHUCMS_ALLOWED_ORIGINS`. |
| GET /v1/auth/config | Public auth settings are readable (reports whether OIDC login is enabled). |
| List connections | The token is accepted and at least one connection exists. The first one is used for the rest. |
| List collections | The first connection is reachable and exposes collections this token may read. |
| List records (limit 5) | Reading from the first collection works. |
| Create / Read / Update / Delete record | A full write cycle on the first collection whose required fields are simple. Writes send an `Idempotency-Key`. The record is deleted at the end. SKIP when the connection is `read_only`. Run this on a scratch connection, not production data. |
| Events stream | Opens `/v1/events` with an `Authorization` header (fetch streaming) for about 3 s, waits for `ready`, makes a write, and expects an event. Without a write (read-only) it only checks `ready` and reports SKIP. |
| Bad token is rejected | A made-up token must get 401, never 200. |

"Copy report" copies the plain-text report (also shown in the box) so it can be pasted back. It contains no token.
