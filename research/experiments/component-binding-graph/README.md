# Component graph binding experiment

**Result: the normal Convex component graph can drive a local Alchemy Worker and its exact component
binding.** The complete flow passed on 2026-10-23. The host calls a component action, the action
sends text to a secret-protected Worker, the Worker changes the text to uppercase, and the component
saves the result. The host query returns the saved result. Requests with no secret or an incorrect
secret both return HTTP 401.

## Run

From a new Samebase linked worktree, first run the required setup:

```sh
pnpm run dev --once
cd research/experiments/component-binding-graph
pnpm run dev
pnpm run check
```

The sample uses Node 24 and dependencies from the parent workspace lockfile. `setup.ts` links the
Convex SDK, Zod, and Node types. The sample does not install another dependency set.

`pnpm run dev` starts a disposable anonymous Convex backend on port 33410, its site on 33411, and an
Alchemy local Worker on 33412. It runs the assertions and stops its child processes. There is no
browser UI or tunnel. No preview stays running after the command.

Each run deletes only this sample's `.convex` database and `.env.local`, then creates a new local
backend. This is necessary to prove discovery before the required values exist. After a completed
deployment, Convex rejects deletion of a required environment variable. The sample keeps its Alchemy
local state so subsequent runs reconcile the same Worker identity.

Child processes receive basic operating-system variables, anonymous Convex mode, and a new
sample-only secret. Alchemy uses a separate `.local/alchemy-home`. The sample does not use the host
app's deployment key or Cloudflare credentials. Local state, generated code, raw requests, and
secrets are ignored by Git. The raw push request contains the local admin key and is removed as soon
as it is read.

## Data path

1. `convex/convex.config.ts` uses ordinary `defineApp` and `app.use`. This is the sole mount
   declaration. It binds the component's two required environment values to required app values.
2. The real Convex CLI builds the app with its hidden `deploy --dry-run --write-push-request`
   option. The script sends that unmodified request to the local `/api/deploy2/start_push` endpoint.
3. The response supplies `componentPath`, `definitionPath`, and symbolic environment references. The
   script validates these fields and confirms that both required values are absent from the returned
   deployment environment. No optional validators or placeholder values are used.
4. A small explicit registry in `alchemy.run.ts` maps `../job/convex` to `job/alchemy.ts`. The
   companion receives the graph's component path as its Worker logical ID. The runner writes the
   Worker URL and generated secret to the app environment names from that same graph.
5. The CLI completes a normal deploy. The host action calls the component, and the host query
   verifies that the component saved the Worker's result.

The observed Worker has resource type `Cloudflare.Worker`, FQN `jobs`, and local URL
`http://localhost:33412`. Its state scope is stack `component-binding-graph`, stage
`local-experiment`. [The sanitized fixture](./fixtures/observed-local-result.json) was projected
from the actual backend response, actual Alchemy resource output, and actual runtime result. It
contains no admin key, environment values, or Worker secret.

The companion stays outside `job/convex`. Convex bundles the files under the component function
root. Putting the Alchemy entrypoint in that directory made the real CLI try to bundle Node and
Cloudflare infrastructure imports into the Convex isolate.

## Pins and private interfaces

| Item               | Tested version                    |
| ------------------ | --------------------------------- |
| Convex SDK and CLI | `1.46.0`                          |
| Local backend      | `precompiled-2026-10-10-72ce13c`  |
| Alchemy            | `2.0.0-beta.83`                   |
| Effect             | `4.0.4`, from the parent lockfile |

The runner checks the Convex and Alchemy versions and selects the backend version explicitly. The
exact CLI source is commit
[`c1c639a9`](https://github.com/get-convex/convex-js/tree/c1c639a9a117cc537a22a806995d6491206b7f1e).
Its
[request construction and hidden output branch](https://github.com/get-convex/convex-js/blob/c1c639a9a117cc537a22a806995d6491206b7f1e/src/cli/lib/components.ts#L434)
are private implementation details. The experiment does not import CLI internals or fabricate a
component definition path.

`start_push` is a deployment operation, not a read-only graph query. The
[backend handler](https://github.com/get-convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/crates/local_backend/src/deploy_config2.rs#L331)
requires deployment permission. The
[backend's dry-run explanation](https://github.com/get-convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/crates/local_backend/src/deploy_config2.rs#L427)
states that this step commits schema changes for validation. These links use the full source commit
that matches the tested backend's `72ce13c` suffix.

`dryRun` does not prevent all writes. The
[schema write transaction](https://github.com/get-convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/crates/application/src/deploy_config.rs#L359)
still runs. It does change two later effects: the
[index diff](https://github.com/get-convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/crates/application/src/deploy_config.rs#L216)
is computed in a discarded transaction, without committing pending indexes, and
[`finish_push` is skipped](https://github.com/get-convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/crates/local_backend/src/deploy_config2.rs#L464).
Only disposable local deployment state was used here.

The returned `env` field is absent from the installed CLI's `checkedComponent` TypeScript schema.
`graph.ts` therefore validates the narrow shape observed in the real response. This is a pinned
private protocol adapter, not a supported public graph API.

## Scope and recommendation

This proves a staged local process: create backend, build and analyze config, declare the Worker,
write binding values, then deploy functions. A fresh cloud deployment must also exist before graph
analysis. This experiment does not prove that those steps fit a single fresh Alchemy stack plan.
Production creation order, graph refresh on updates, rename/removal behavior, and cleanup remain
integration work.

The registry is still required. A definition path is not a package name or version, and Convex does
not advertise an Alchemy companion export. This sample supports one direct mount with two env-var
references. Nested mounts, literal bindings, and repeated mounts were not tested. Backend reads of
these required values occur inside handlers; eager reads during module analysis need a separate
probe.

Keep normal `app.use` authoritative if graph-based discovery is the goal. Use an explicit companion
contract and isolate the private protocol behind a version check. A supported Convex build manifest
that exposes full instance paths and environment references would remove the main integration risk.
