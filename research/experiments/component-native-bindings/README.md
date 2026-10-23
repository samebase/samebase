# Native Alchemy bindings with normal Convex functions

This local experiment passed on 2026-10-23. An actual Alchemy `Resource.bind` records the component
path, Worker identity, and component environment. A small local provider consumes those bindings,
sets Convex environment values, and pushes normal Convex code. It returns the resource association
only after the push and a check of the mounted component.

The app keeps normal `defineApp`, `app.use`, `defineComponent`, `defineSchema`, `action`, `query`,
and generated typed `env`. No Confect function DSL or custom Alchemy Runtime is used.

## Run

In a new linked worktree, first run `pnpm run dev --once` at the repository root. Then run:

```sh
pnpm --dir research/experiments/component-native-bindings run dev
pnpm --dir research/experiments/component-native-bindings run check
```

The runner uses an isolated anonymous Convex backend on ports 33440 and 33441, and a real local
Cloudflare Worker on port 33442 through Alchemy. It removes its own backend, generated files, and
Alchemy state before each run. It filters inherited environment values and uses a new random Worker
secret. No cloud credentials or provider account operations are used. All sample processes stop
before the command exits. No public tunnel or browser preview runs.

Pins: Alchemy `2.0.0-beta.83`, Convex CLI `1.46.0`, and backend `precompiled-2026-10-10-72ce13c`.
The runner checks the installed package versions. `setup.ts` links the dependencies already
installed by the repository bootstrap.

## The integration

The stack calls the existing native API:

```ts
yield *
  deployment.bind(worker.FQN, {
    componentPath: "jobs",
    resource: { fqn: worker.FQN, type: worker.Type },
    env: { WORKER_URL: worker.url, WORKER_SECRET: secret },
  });
```

`deployment.ts` adds the provider feature absent from `@samebase/alchemy-convex@0.8.0`. Its fourth
`Resource` type parameter is the binding data contract. Alchemy resolves the Worker output and
passes the native binding records into `reconcile`. The provider derives `JOBS_WORKER_URL` and
`JOBS_WORKER_SECRET` from the component path and component-local keys. That same record produces the
`jobs -> Processor / Cloudflare.Worker` output association.

Normal `convex/convex.config.ts` declares the required root environment and maps it into the
component. The mount name `jobs` is still explicit in both the config and the Alchemy binding.
Alchemy does not discover `app.use` identity. The private dashboard query below checks the path
after deployment; it does not prove that the environment references in the config match the binding.
The runtime test proves that connection for this sample. Nested mounts and automatic companion
discovery remain unimplemented.

## Observed result

The sanitized captured result is in `fixtures/observed-local-result.json`.

- Initial apply persisted two real native bindings on `App`. The component action called the Worker,
  stored its uppercase result in the component table, and the host query read that row.
- Requests without authorization and with the wrong secret each returned HTTP 401.
- A second apply changed the Worker URL environment value. The action still succeeded.
- Removing the marker binding removed `JOBS_MARKER` from Convex and from the successful association.
  Alchemy state contained only the remaining binding.
- An invalid URL failed before environment writes. Alchemy retained the previous attributes in its
  `updating` state. The previous environment value stayed intact, and no new success record was
  produced.
- The scoped format, lint, and full sample TypeScript checks passed after real Convex codegen.

## Boundaries and source evidence

This is a local provider prototype, not a patch to the published Convex provider. Its deployment
target is hardcoded to its own local backend. It does not implement cloud credentials, live drift
reads, env ownership/adoption, content hashing, rollback after a partial push, or resource deletion.
`delete` is a no-op because the runner owns and removes the disposable backend. Removing the
complete required component binding still needs a coordinated config change. The test removes an
unused marker binding, not the whole installed component.

The existing provider must include active bindings in env merge, hash, ownership, removal, and
association output if this contract is adopted. Environment writes and a Convex push are separate
operations. A failed apply must not be presented as the current successful association.

- Native
  [Resource binding contract and registration](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Resource.ts#L194),
  [record storage](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Resource.ts#L378),
  and
  [provider reconcile input](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Provider.ts#L327).
- Alchemy
  [excludes deleted bindings](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Apply.ts#L2262)
  before passing the active records to the provider. The removal test checks the resulting env.
- Provider 0.8.0 has
  [binding type `never`](https://github.com/samebase/alchemy-convex/blob/0377f23edd121f510c9d815e62e257832698ee1d/src/Deployment.ts#L144)
  and
  [reads only `news.env`](https://github.com/samebase/alchemy-convex/blob/0377f23edd121f510c9d815e62e257832698ee1d/src/Deployment.ts#L657).
- The read after the push uses `/api/query_batch` and
  [`_system/frontend/components:list`](https://github.com/convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/npm-packages/system-udfs/convex/_system/frontend/components.ts#L4).
  These are private dashboard interfaces. The parser accepts only the fields this check needs.
- Importing `convex.config.ts` into the Alchemy process is not a supported mount bridge.
  [`app.use` requires the Convex evaluator's definition path](https://github.com/get-convex/convex-js/blob/c1c639a9a117cc537a22a806995d6491206b7f1e/src/server/components/index.ts#L414).
  Infrastructure stays outside the Convex functions directory so the normal CLI does not bundle its
  Node dependencies into functions.

## Summary

Native resource bindings can carry component env and resource associations while Convex functions
stay unchanged. This needs a provider extension, not a custom function DSL. It does not by itself
make the Convex mount and Alchemy companion one installation.
