# SethuCMS examples

Four small front ends that call a running SethuCMS gateway, so you can check
it works from each stack. Each one has a **Self-check** (or "Run checks")
that walks through health, listing, create, read, update, delete and the live
change feed, and shows pass or fail per step.

| Folder       | Stack                         | Where the token lives            |
| ------------ | ----------------------------- | -------------------------------- |
| `plain-html` | One HTML file, no build       | Browser (local testing only)     |
| `react`      | React + Vite                  | Browser (local testing only)     |
| `angular`    | Angular, standalone + signals | Browser (local testing only)     |
| `nextjs`     | Next.js App Router (`app/`)   | **Server only** (never in browser) |

Start with `plain-html` (fastest, nothing to install), then the framework you
care about. For real apps, do it the Next.js way: keep the token on a server.

## Folder layout this expects

Clone the repos side by side (the apps find the SDK at `../../sethucms-sdk-ts`):

```
~/sethucms             the gateway (run it with scripts/run-local.sh)
~/sethucms-sdk-ts      the TypeScript SDK (build it once: pnpm install && pnpm build)
~/sethucms-examples    this repo
```

## Common setup

1. Build the SDK once: `cd ~/sethucms-sdk-ts && pnpm install && pnpm build`.
2. Start the gateway: `cd ~/sethucms && sh scripts/run-local.sh`. On first start
   it prints an admin token. Copy it.
3. For browser apps on another port, start the gateway with
   `SETHUCMS_ALLOWED_ORIGINS` set to that app's origin (each README says which).
4. Open the folder's README for the exact steps.

## License

MIT. See `LICENSE`.
