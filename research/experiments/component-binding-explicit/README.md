# Explicit component binding experiment

This experiment passed on 2026-10-23 with Node 24.22.1, Convex 1.46.0, Alchemy 2.0.0-beta.83, and
Effect 4.0.4. It runs a real anonymous Convex backend and a real Alchemy local Worker in workerd. No
runtime calls are mocked.

## Design

The normal Convex config installs `jobs`. The component owns two tables: `workerBindings` holds its
Worker URL and secret, and `results` holds completed jobs. The host has an action that calls the
component and a query that reads its result. The component sends text to the Worker over HTTP. The
Worker checks the secret, trims the text, and changes it to uppercase.

The Alchemy stack declares the Worker, then runs `BindJobs` with the explicit target
`{ deployment: "http://127.0.0.1:33210", componentPath: "jobs" }`. `BindJobs` waits for the Worker
output and uses the supported Convex CLI:

```text
convex run --env-file .local/binding.env --component jobs jobs:configure <arguments>
```

The component path selects the real configuration mutation. It is also included in the nonsecret
Alchemy output. The action updates the existing configuration row instead of adding a second row.
Normal Convex handlers and config contain no Alchemy imports.

This variant deliberately uses a component configuration table. It tests a post-deploy binding
targeted at a full component path. Public typed component env is also available in this Convex
version, but must be wired through app config and deployment env. That is a different contract. This
experiment does not establish that mutable table configuration is preferable for production.

## Run

From a bootstrapped repository checkout:

```sh
pnpm run dev --once
pnpm --dir research/experiments/component-binding-explicit install
pnpm --dir research/experiments/component-binding-explicit run dev --once
pnpm exec tsgo -p research/experiments/component-binding-explicit/tsconfig.json --pretty false
pnpm exec vp fmt --check research/experiments/component-binding-explicit
```

The first command is the repository's required linked-worktree setup. It uses the existing
repository seed flow. The sample creates a separate backend under its own `.convex/` directory. The
sample child processes receive a small environment allowlist and no inherited cloud deploy key. They
do not use another checkout's env file. The sample uses the root's pinned Alchemy and Effect
dependencies and its own exact Convex dependency. Its lockfile and Convex code generation are local
artifacts, excluded from the research commit.

`dev --once` pushes normal component code, starts `alchemy dev --stage local`, waits for the
successful stack output, runs `verify.ts`, and stops both runtimes. The ports are 33210 for Convex,
33211 for Convex HTTP actions, and 33212 for the Worker. The ports must be free. Omit `--once` to
leave the runtimes running; run
`pnpm --dir research/experiments/component-binding-explicit run verify` separately. Stop the
foreground dev command with Ctrl+C.

## Observed results

The final runtime verification and scoped typecheck passed. The runtime output was:

```json
{
  "association": {
    "deployment": "http://127.0.0.1:33210",
    "componentPath": "jobs",
    "resourceFqn": "JobWorker",
    "workerUrl": "http://localhost:33212"
  },
  "result": {
    "input": "  Explicit component binding  ",
    "output": "EXPLICIT COMPONENT BINDING"
  },
  "wrongSecretStatus": 401
}
```

Alchemy reported `[JobWorker] create (local)`, started workerd, then ran `BindJobs`. It used
`localState()` and stage `local`. No Cloudflare token was supplied, no Cloudflare login was
requested, and no cloud provider operation was run. The sample used a separate named Alchemy
profile. This is local-provider evidence, not evidence of a hosted Cloudflare or Convex deployment.

Additional lifecycle checks used the same real runtimes:

- A source-only stack edit with unchanged inputs produced `Plan: no changes` and
  `[BindJobs] skipped`. The action does not run on every apply.
- Changing the target to the absent component `missing_jobs` failed registration. The local backend
  returned `InternalServerError`. The previous `jobs` binding still worked, and the stack output
  still described that last successful binding. The bad target and source-only edit were then
  removed.
- A restart with a fresh secret initially exposed a beta.83 limitation: Worker env changed, but the
  action skipped and the component received HTTP 401. Alchemy's action hash uses `JSON.stringify` on
  resolved input, which hides Redacted values. The final code includes a SHA-256 hash of the fresh
  256-bit random secret in its action input. Rotation then ran registration and the runtime check
  passed. The actual secret stays Redacted in Alchemy inputs and is absent from stack output.
  [Action input hashing](https://github.com/alchemy-run/alchemy/blob/db20b54e8c55e8cede9ef66ad2dd25b7e74d35da/packages/alchemy/src/Util/sha256.ts#L15).

## Files and repeated configuration

| File                      | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `alchemy.run.ts`          | Worker, explicit target, action dependency, nonsecret output |
| `binding.ts`              | Component registration through the supported CLI             |
| `worker.ts`               | Stateless HTTP transformation and secret check               |
| `convex/convex.config.ts` | Ordinary `app.use` mount                                     |
| `convex/host.ts`          | Normal host wrappers                                         |
| `convex/components/jobs/` | Component config, schema, action, mutation, query            |
| `dev.ts`, `verify.ts`     | Isolated runtime setup, assertions, cleanup                  |

The integration repeats one mount identity as two string declarations: the `app.use` name and the
explicit Alchemy component path. Two typed host references also name `components.jobs`; code
generation checks those. The Worker secret key `JOB_SECRET` occurs in the stack and Worker
interface. The CLI route `jobs:configure` is one string contract tied to the component file/export.
The local deployment port is repeated in the runner, target, and verification; this is test setup,
not a generated component relation. No component env names or callback URL are needed in this
variant.

## Limits and integration advice

- The sample deploys Convex code before Alchemy starts. It does not exercise
  `@samebase/alchemy-convex` cloud creation, temporary key issuance, or a `Convex.Deployment` output
  dependency. The explicit deployment target here is a local URL, not a new Alchemy deployment
  resource type.
- Registration is a separate mutation after Worker reconciliation. It is not atomic with Worker
  changes. A failed registration can leave old component configuration beside new Worker
  configuration. The failed-target check proved that the prior config and prior stack output remain,
  not that they are current.
- An unchanged action does not detect deleted or manually changed component configuration. A changed
  component schema alone is not an action input. A real integration must include the successful
  Convex deployment identity/hash, define retry and drift behavior, and keep metadata marked as
  last-successful output.
- Removing the Alchemy action does not clear the component table. There is no binding delete
  lifecycle in this probe. Secret values exist in ignored local runtime/state files and the
  component table. These files are not shareable logs.
- The sample has no user auth. Its host functions are for an isolated local backend only. Production
  wrappers need their app's authorization boundary.
- Only one component mount was tested. The CLI accepts a full path, but this probe does not prove
  nested or repeated mounts, package distribution, or secret rotation without an interruption
  window.

Keep the explicit target as a small reference design. It proves that ordinary Convex components can
receive a real Worker binding without a new function DSL. Compare its mutable registration and
repeated mount string with the typed-env variant before selecting a production contract. Do not turn
this sample action into a generic reconciler.
