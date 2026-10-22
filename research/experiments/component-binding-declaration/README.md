# One feature declaration experiment

This local experiment passed on 2026-10-23. One installation declaration supplies the mount name,
Worker source, and HTTP binding. Ordinary Convex files still own the schema and functions. No query
DSL or application framework is added.

## Proposed API

The feature definition points to normal source files and declares its binding fields:

```ts
export const textJob = {
  componentConfig: "./feature/convex/convex.config.ts",
  workerEntry: "./feature/worker.ts",
  binding: {
    componentUrl: "WORKER_URL",
    componentSecret: "WORKER_SECRET",
    workerSecret: "BRIDGE_SECRET",
  },
} as const;
```

The host declares one installation in `host.ts`:

```ts
export const feature = { definition: textJob, name: "textJobs" } as const;
```

The host keeps its normal `convex.config.ts`. It directly imports the actual component config and
calls `mount(app, component)`. The adapter reads the shared declaration to set the mount name and
map root environment references into the component. Alchemy reads the neutral declaration without
executing any component config in Node.

`infrastructure.ts` constructs real `Cloudflare.Worker` and `Convex.Deployment` declarations. Their
FQNs are `textJobs/Transform` and `Site`. The component URL refers to the Worker's output. The same
binding supplies the Worker secret and the component secret, and produces the association record.
The component source path in that record is metadata. The required static import in the host config
remains a manual link; this experiment does not prove automatic package discovery.

## Run

Use Node 24.22.1. The checked package versions are Convex 1.46.0, Alchemy 2.0.0-beta.83,
`@samebase/alchemy-convex` 0.8.0, Effect and its Node packages 4.0.4, and Wrangler 4.151.0.

From this directory:

```sh
pnpm install --ignore-workspace --ignore-scripts
pnpm run dev --once
pnpm run typecheck
```

`pnpm run dev` keeps the servers open. In another terminal, `pnpm run verify` runs the assertions.
The sample uses ports 33310 for Convex, 33311 for HTTP actions, 33312 for the Worker, and 33313 for
the Worker inspector. It uses only its own `.convex`, `.env.local`, and `.local` files. It creates a
new random test secret on each run. Wrangler reads that secret from an ignored `.dev.vars` file and
hides the value in its output. No shared provider credentials are passed to the sample.

The runner starts normal anonymous Convex dev, sets environment values on that local backend, and
waits for the host query. It calls the Convex CLI through its sample installation. The local admin
key is read only from this sample's backend config. `--once` runs verification and stops both local
servers. No preview or tunnel remains running after the checks.

## Verified results

A clean run removed the sample backend state, local deployment selection, and both Convex generated
directories before running `pnpm run dev --once`. Convex regenerated its normal app and component
types, installed `textJobs`, and completed the push in 961 ms. The backend version was
`precompiled-2026-10-10-72ce13c`.

The checks passed:

- A host action called the component action with text.
- The component made a real HTTP request to local Wrangler/workerd.
- The Worker checked its secret, trimmed the text, and converted it to uppercase.
- The component saved the result in its own `results` table.
- The host query returned that stored input and result.
- A direct request with the wrong secret received HTTP 401.
- The generated association matched the declaration that supplied the runtime bindings.
- The Alchemy resource map contained the actual Worker and deployment declarations.
- `pnpm run typecheck` passed after normal Convex code generation.

A second run against the existing local backend also passed with a new random secret. This proves
the sample runner updates both local runtimes. It does not prove Alchemy cloud secret rotation.

The runtime test uses **direct Wrangler**, not Alchemy local dev. The runner takes Wrangler's entry
file and secret from evaluated `Cloudflare.Worker.Props`. It takes the Convex environment values
from evaluated `Convex.Deployment.Props`, with `worker.url` resolved to the local Worker URL. The
Alchemy provider collection fails if a provider operation is requested. Project ID `0` is only a
construction placeholder. No Alchemy plan, provider lifecycle, cloud deployment, or production read
ran. The association is a local experiment artifact, not a successful cloud-deployment record.

## Failures and limits

Hiding the component config import inside either the feature declaration or the adapter caused
repeated HTTP 500 responses from Convex `deploy2/start_push`. A direct import in the host
`convex.config.ts`, passed into the adapter, succeeded against the same backend and state. The
recorded error was `InternalServerError: Your request couldn't be completed. Try again later.` The
backend error detail was unavailable. This is evidence for the tested import forms, not a claim that
all indirect component imports are unsupported.

The initial generated-config approach was removed. The passing adapter does not need to generate or
own an existing application's whole Convex config. The manual host work is one installation
declaration, one direct component-config import, one adapter import, the adapter's environment
object in `defineApp`, and one `mount` call. The host's action/query wrappers expose application
behavior and remain ordinary Convex code.

The isolated dependency install initially mixed Effect 4.0.4 with Node platform 4.0.5. Their exports
did not match. The sample pins the platform packages to 4.0.4. The first-party provider release-age
exception matches the already reviewed exception in the repository root.

The first runner tried a second anonymous `convex dev` while one was running. That CLI rejected the
occupied backend port. The final runner uses one dev process and explicit local credentials for
environment writes. A missing required environment value can fail the initial push while local setup
runs; the dev process retries after those values are set.

The host endpoints have no application auth because this is an isolated local experiment. The test
covers one leaf component and one one-way HTTP binding. It does not cover callbacks, nested
components, repeated mounts, R2, provider deletion, production identity, or state freshness.

## Size and integration advice

Excluding this README and the lockfile, the experiment has 20 authored files and 473 lines. The
local runner and verification script account for 200 lines. Convex generates 9 standard files with
720 lines; these are ignored and regenerated. There is no custom generated source file. Three
ignored runtime files hold the Worker config, local secret, and association. The separate lockfile
has 2911 lines and should not be counted as feature API code.

Keep the neutral installation declaration and the normal host config adapter when comparing this
approach with explicit wiring. Prefer Alchemy's own local Worker runtime for a product integration
if it can consume this same declaration. That removes the separate Wrangler translation used by this
probe. Do not infer that one declaration removes every static import or application wrapper. The
useful result is one source for the installation name and binding, while normal Convex code and its
type generator continue to work.
