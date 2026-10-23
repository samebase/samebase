# Native Alchemy exports with a normal Convex component

This experiment passed on 2026-10-23. The feature exports real Alchemy declarations. There is no
feature descriptor, mount adapter, generated config, or query DSL. The host still mounts the Convex
component and maps its environment values explicitly. This is a working baseline, not an automatic
Alchemy binding for Convex.

An optional [runtime import probe](./RUNTIME_IMPORT.md) uses the same app and Worker. Run
`pnpm run dev --once --runtime-import` to test native Ref capture and Output access inside the
component action. The default command below keeps the simpler native-export path.

## The connection in code

`feature/alchemy.ts` owns the secret and Worker. These are ordinary native Alchemy Effects:

```ts
export const BridgeSecret = Random(`${componentName}/Secret`);

export const Transform = Effect.gen(function* () {
  const secret = yield* BridgeSecret;
  return yield* Cloudflare.Worker(`${componentName}/Transform`, {
    main: fileURLToPath(new URL("./worker.ts", import.meta.url)),
    env: { BRIDGE_SECRET: secret.text },
  });
});
```

`infrastructure.ts` imports both exports and yields them. It puts `worker.url` into
`Convex.Deployment.env.TEXT_JOB_URL` and `secret.text` into `TEXT_JOB_SECRET`. The URL remains an
Alchemy Output until it is resolved. The host supplies its existing project ID to this Effect.

The normal host `convex/convex.config.ts` forwards those values to the component:

```ts
const app = defineApp({ env: { TEXT_JOB_URL: v.string(), TEXT_JOB_SECRET: v.string() } });
app.use(component, {
  name: componentName,
  env: { WORKER_URL: app.env.TEXT_JOB_URL, WORKER_SECRET: app.env.TEXT_JOB_SECRET },
});
```

The component action reads `env.WORKER_URL` and `env.WORKER_SECRET`, sends text to the Worker, and
saves the response in its own `results` table. Its schema and functions use normal Convex APIs.

The only shared identifier is `componentName`, a string in `feature/name.ts`. The actual mount and
the small association output both use it. Resource IDs come from real resource handles. The
association is an explicit author declaration. It does not discover a mount, pass a Convex mount
handle to Alchemy, or prove lifecycle ownership. Environment names still appear in both native
configurations. A native Convex binding would need to address that separate boundary.

## Run

From this directory, with Node 24.22.1:

```sh
pnpm install
pnpm run dev --once
pnpm run typecheck
```

The checked versions are Alchemy 2.0.0-beta.83, `@samebase/alchemy-convex` 0.8.0, Convex 1.46.0,
Effect and Node platform 4.0.4, Wrangler 4.151.0, TypeScript 6.0.3, and pnpm 12.14.0. The workspace
pins the Effect Node shared package to 4.0.4 to avoid mismatched exports. The lockfile stays local.

`pnpm run dev` keeps the sample open. `pnpm run verify` checks a running sample. Ports are 33610
(Convex), 33611 (HTTP actions), 33612 (Worker), and 33613 (Worker inspector). All state and secrets
stay in this directory's ignored files. The runner passes no inherited provider or deployment keys.
`--once` first removes only this sample's `.convex`, `.env.local`, and both Convex `_generated`
directories. It creates a fresh backend, regenerates types, verifies the result, and stops the
servers. This command resets the sample's local data. No preview or tunnel remains running.

## Evidence and test boundary

`pnpm run dev --once` completed a normal Convex push with component type generation, then passed:

- Host action → component action → real HTTP request to local Wrangler/workerd.
- Worker secret check, text transformation, component table write, and host query.
- Wrong-secret HTTP 401.
- Worker and secret exports reused from two modules return the same resource objects. Exactly
  `textJobs/Secret`, `textJobs/Transform`, and `Site` register in the Stack.
- The Worker URL Output resolves into the actual Deployment props. The same secret Output resolves
  into the Worker and Deployment props.
- The association contains the mounted component name and actual resource FQNs, without a secret.
- `pnpm run typecheck` passed after code generation.

The backend was `precompiled-2026-10-10-72ce13c`. Standard Convex generated files remain ignored.

An independent rerun found a startup race: a query from a previous local push could succeed before
the current push finished. Verification then used the old component environment and received HTTP
401 from the Worker. The disposable `--once` flow now resets the local backend before startup, so
that query cannot exist until the current functions have been pushed. Use `--once` for repeatable
verification. Interactive dev retains its database; wait for the CLI's successful push before
running verification there.

Two consecutive `pnpm run dev --once` runs passed after this fix. Each installed `textJobs` and
reported a successful push before verification started (984.6 ms and 955.18 ms). All runtime checks
and the subsequent `pnpm run typecheck` passed.

`local-construction.ts` is test equipment. It supplies an empty Stack, rejects cloud provider
operations, uses fixture project ID `0`, and supplies local output values for the Worker and Random
resource. It does not run the Random provider lifecycle. `dev.ts` starts **direct Wrangler**, using
the evaluated Worker props, and sets the anonymous backend environment from evaluated Deployment
props. The runtime chain is real; Alchemy plan, apply, state persistence, cloud deployment, and
cloud secret rotation were not run.

## Import boundaries that failed

Adding these lines to the real host Convex config caused the normal dev command to fail at esbuild:

```ts
import { Transform } from "../feature/alchemy.ts";
export const nativeResource = Transform;
```

The declaration was not yielded. The bundle still included Alchemy's Node dependencies and failed
with 314 resolution errors, including `node:worker_threads`, `node:fs/promises`, and `node:crypto`.
An inert declaration does not make its imported implementation compatible with Convex's evaluator.
The final config does not import Alchemy.

A named string export from the leaf Convex config imported successfully in ordinary Node. The same
named import failed when the config also called `component.use(child)`:
`Component definition does not have the required componentDefinitionPath property. This code only works in Convex runtime.`
ES modules execute the whole imported module. Therefore the name stays in a separate plain file.

The previous experiment also received generic HTTP 500 responses when the actual component import
was hidden inside an adapter. The final host config imports the component directly. These results
describe the tested forms; they do not establish that every indirect import fails.

## What changed

Removed `feature/definition.ts`, `host.ts`, `binding.ts`, and `convex-adapter.ts`. Added native
`feature/alchemy.ts`, the one-line `feature/name.ts`, and the separate local construction fixture.
The existing runner, component, Worker, and host functions remain. There is no second sample copy.

The relevant Alchemy guidance is [Resources](https://alchemy.run/infrastructure-as-code/resource/),
[References](https://alchemy.run/infrastructure-as-code/references/), and
[File layout](https://alchemy.run/project-structure/file-layout/). This sample uses native exports
and `yield*`, available in beta83. It does not use the newer `Output.ref` shown in current docs.
