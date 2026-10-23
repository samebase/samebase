# Native Output access inside a Convex component

Tested on 2026-10-23 with Alchemy 2.0.0-beta.83 and Convex 1.46.0. This extends the native-module
sample. It keeps the normal component schema, action, mutation, and host query.

## Passing path

The same binding Effect is used during construction and inside the component action:

```ts
export const workerUrl = map(
  of(
    ref<Worker>("textJobs/Transform", {
      stack: "ComponentNativeAlchemyExperiment",
      stage: "local",
    }),
  ),
  (worker) => worker.url,
).bind("workerUrl");
```

1. `captureBinding.ts` runs that Effect with a `BaseRuntimeContext` whose `set` stores the native
   Output. It does not run the returned accessor at construction time.
2. The captured Output supplies the deployment environment. Alchemy evaluates its Ref against a
   local state fixture whose URL is the endpoint used by the real Wrangler process.
3. `build-runtime.ts` uses Alchemy's own `Bundle.build` to produce a runtime bundle. The bundle
   contains the binding and native RuntimeContext helpers. Its checked size was about 8 KiB, with no
   Node built-in imports. Effect remains an external dependency.
4. The ordinary component action imports that bundle, supplies its typed component environment
   through a small `BaseRuntimeContext`, and runs the binding, then its returned accessor.
5. The action calls the real Worker over HTTP, saves the transformed text in its component table,
   and returns the result. The host query reads the saved result.

The runtime `set` does not register infrastructure. That work happened in the construction capture.
The runtime `get` uses Alchemy's own `unpackEnvValue`, with no cast or custom generic overload. The
capture has one narrow `@ts-expect-error` because `BaseRuntimeContext.set` erases the Output's
requirements. This probe captures only its pure Ref expression.

## Run and results

```sh
pnpm install
pnpm run dev --once --runtime-import
pnpm run typecheck
```

The default `pnpm run dev --once` keeps the simpler native-export path. The explicit flag selects
the shared Ref capture and alternate component action. Use `pnpm run verify --runtime-import` when
that mode is already running. Both modes build the small runtime module because Convex bundles both
component actions. The default mode does not capture or evaluate a Ref.

The runner builds the runtime bundle before Convex starts. It uses ports 33610 to 33613. It passes
no shared provider credentials and creates a fresh local secret. The command stops its servers. The
generated bundle, declarations, backend state, secrets, lockfile, and logs stay ignored.

The checks passed: host action, real Worker HTTP 200, saved component result, host query, and HTTP
401 for a wrong secret. Changing the Ref to `missing/Worker` fails Alchemy evaluation with
`InvalidReferenceError`, before a component request. Thus the selected Ref supplies the tested
runtime URL. The result is not merely an accessor returning an unrelated constant.

## Failed native import paths

These were actual Convex push or runtime attempts with the same pinned versions:

| Attempt                                                               | Observed result                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Normal component action imports a Worker through `alchemy/Cloudflare` | Push fails with 312 Node built-in resolution errors, including `node:crypto`.                                  |
| Granular `alchemy/Cloudflare/Workers/Worker` import                   | Push fails with 184 Node built-in resolution errors, including `fs`.                                           |
| Normal component action imports only `alchemy/Output`                 | Push fails with 32 Node built-in resolution errors.                                                            |
| Separate component action with `"use node"`                           | Convex rejects the directive: `"use node" directive is not supported in components.`                           |
| Runtime bundle without a supplied RuntimeContext                      | Push succeeds, action fails with `Service not found: RuntimeContext`.                                          |
| Alchemy `Bundle.build` on a full Worker declaration                   | The 289,622-byte bundle still imports Node modules, including `node:net`, `node:fs`, and `node:child_process`. |

The direct import probe used this module and imported `Transform` into a normal component action:

```ts
import { Worker } from "alchemy/Cloudflare/Workers/Worker";
export const Transform = Worker("Transform", {
  main: new URL("./worker.ts", import.meta.url).href,
});
```

The command was `pnpm run dev`, with `--typecheck=disable` passed to the sample's Convex child so
the probe reached the real bundler. The granular import failed before the action could run. The
unused failed module was removed. The optional Bun platform package is pinned only to let the
Node/full-Worker comparison pass optional dependency resolution and reach the actual runtime
boundary. No module stubs or compiler patches were added.

## Limits

This does not import the same Worker declaration into a component action. It imports a native Ref
and its Output accessor through a small build adapter. The resource FQN, stack, stage, binding key,
and component environment mapping remain explicit. It does not discover component ownership.

The state fixture records the local Wrangler URL. No Alchemy plan, apply, state persistence,
provider lifecycle, or cloud operation ran. Native Ref evaluation requires an existing resource
state. This experiment does not solve first-deployment ordering or make a new-resource dependency
from the Ref. The native resource binding experiment covers lifecycle separately.

The runtime helper and capture helper are small, but a product integration still needs a supported
build hook and a deployment host that performs capture. Do not describe this as a ready native
Convex integration or a single-import component API.
