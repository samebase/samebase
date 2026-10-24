# Component associations through native Alchemy bindings

This experiment runs a normal Convex component, its nested job component, a Cloudflare Worker, and
local R2 buckets. It passed on 2026-10-24. It tests a proposed association contract, not a published
provider feature or an accepted Samebase standard.

## Start with these files

- [The app mount](convex/convex.config.ts) installs the processing component.
- [The parent mount](processing/convex.config.ts) installs its job component.
- [The package resource export](job/alchemy.ts) declares the Worker and its buckets.
- [The app stack](alchemy.run.ts) connects generated component references to Alchemy namespaces.
- [The state reader](inventory.ts) lists the actual resources in each namespace after apply.

The package uses ordinary exported Alchemy Effects. Convex keeps normal config, schema, actions,
queries, and generated environment values. No custom function language is needed.

## The connection

The app mounts the component once:

```ts
app.use(processing, {
  name: "processing",
  env: { WORKER_URL: app.env.JOBS_WORKER_URL, WORKER_SECRET: app.env.JOBS_WORKER_SECRET },
});
```

The stack reads `components.processing` from the app's generated API. For the nested component it
also reads `processingComponents.jobs` from the parent's generated API. The second reference is
relative, so the stack supplies its parent path. The following is the binding in the stack with the
test phase branches omitted:

```ts
const parent = componentPath(components.processing);
// Inside the native Processing / Jobs namespace:
Effect.gen(function* () {
  const namespace = toPath(yield* Namespace.CurrentNamespace);
  const worker = yield* Processor({ secret, archive: sharedBucketRef });
  yield* deployment.bind(namespace.join("/"), {
    componentPath: componentPath(processingComponents.jobs, parent).join("/"),
    namespace,
    uses: [archiveAddress],
    env: { JOBS_WORKER_URL: worker.url, JOBS_WORKER_SECRET: secret },
  });
});
```

`componentPath` is a small adapter for a pinned private Convex reference encoding. It is not a
public component identity API. It accepts a generated component root and rejects a function
reference. The provider checks the path against active mounts after the real Convex push. A
reference by itself does not prove that a component is installed.

The native binding belongs to the deployment resource `App`. Its namespace is in the current Alchemy
stack and stage. This is the grouping rule: **deployment + installed component path points to
stack + stage + namespace**. A deployment provider must expose its resolved deployment identity
alongside these associations. This sample fixes its target to one disposable local backend.

The provider stores only the association. After the whole apply, `inventory.ts` reads resource state
and follows the real namespace chain. It does not split an FQN or keep a resource list. The deepest
associated namespace selects the direct owner. Parent groups can contain child groups. A root
resource with the logical ID `Processing/Lookalike` stays outside the Processing namespace.

The shared bucket uses native `Bucket.ref`. Its reference and the explicit `uses` relationship use
one `archiveAddress` value. Its resource record stays in the shared stack. A reference does not
transfer ownership. Association metadata does not change Alchemy removal policies.

## Run

In a new linked worktree, first run `pnpm run dev --once` at the repository root. Then run:

```sh
pnpm --dir research/experiments/component-native-bindings run dev
pnpm --dir research/experiments/component-native-bindings run check
```

The runner uses an anonymous Convex backend on ports 33440 and 33441, and Alchemy's real local
Cloudflare Worker on port 33442. R2 uses Alchemy's local dev provider. Each Worker call writes and
reads its owned bucket and the bucket referenced from the shared stack. The Convex job saves the
returned value in its component table, and the app query reads it through the parent component.

The runner removes only its own ignored backend, generated files, and Alchemy state before each run.
It filters inherited environment values and creates a random Worker secret. It uses no cloud
credentials or provider account operations. It changes four sample source files for the package
addition and mount rename tests and restores their contents in `finally`. A successful run also
restores generated types. All sample processes stop before exit. No browser preview or public tunnel
runs.

SIGINT, SIGTERM, and SIGHUP request cleanup. The next run rejects source files left changed by an
abrupt termination. Copy the captured result only after the command exits successfully; the result
file is written before the final cleanup checks.

Pins: Alchemy `2.0.0-beta.83`, Convex CLI `1.46.0`, and backend `precompiled-2026-10-10-72ce13c`.
The runner checks the package versions. `setup.ts` links the worktree's installed dependencies.

## Observed checks

Report booleans record passed assertions; resource records and response statuses provide the
observed data.

The sanitized captured result is
[fixtures/observed-local-result.json](fixtures/observed-local-result.json).

| Change                                       | Observed result                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial apply                                | `processing` owns Receipts. `processing/jobs` owns Storage and Processor. The Worker reads both R2 bindings and the component saves its result.                                |
| Add Cache inside the package                 | The new bucket appears under `processing/jobs`. The association metadata does not change.                                                                                      |
| Change the URL and remove the marker binding | The new URL reaches Convex; the unused marker env value is removed.                                                                                                            |
| Change only the secret                       | The URL stays fixed. The old secret returns 401. The new secret and the component action work.                                                                                 |
| Rename the mount to `pipeline`               | Associations use the new component paths. Every Alchemy FQN and instance ID stays the same. The new Convex component starts with an empty table. This is not a data migration. |
| Remove both namespace associations           | All resources remain, retain their identities, and become unassociated. Environment wiring and the component action still work.                                                |
| Read the shared bucket                       | Its record remains only in the shared stack, unchanged across the tested rename and unlink steps.                                                                              |
| Omit the parent from the child reference     | The provider rejects `jobs` because that path is not mounted. No successful association output is written.                                                                     |
| Supply an invalid URL                        | Validation fails before env writes. Alchemy retains the last successful attributes in `updating`; the stack output file is unchanged.                                          |
| Recover with a valid binding                 | Alchemy commits fresh output, the component associations return, and the action works.                                                                                         |

The test also compares the Worker's persisted ARCHIVE binding bucket name with the shared stack's
actual output. This proves the Ref selects that bucket name. It does not prove that separate local
Worker runtimes share one R2 data store. Each failure starts from a committed success and must
produce a fresh state write. The runner checks that all three ports refuse connections before
startup and after cleanup.

Each successful phase waits for terminal deployment resource state and a fresh full stack output
write before reading namespace membership. A failed apply's retained output is a last successful
snapshot, not proof of the current installation. This sample checks that distinction through state
and output timestamps. It does not implement a general remote apply-status service.

## Limits found by the experiment

- Generated component roots remove a repeated path string. They do not discover a package's
  provisioning companion, prove package identity, or establish that env flows to that component. The
  actual mounted-tree check and runtime call establish those facts for this sample.
- Convex 1.46.0 generates a wrong relative child API import when this local parent config is at
  `processing/convex/`. The first runtime run passed, but full TypeScript validation found the bad
  import. Putting the local parent config at `processing/`, at the same depth as the app's
  `convex/`, lets normal codegen produce a correct import. No generated files are patched and no
  type checks are disabled in `run check`. Package imports and other directory layouts need their
  own check before general use.
- Namespace grouping describes association, not all resource use. Dependencies outside the group
  need a `uses` relationship. If only the child association is removed, deepest-namespace grouping
  would assign its resources to the still-associated parent. This run removes both associations.
- The reader covers the resource rows in these pinned local state files. It does not observe
  provider objects that have no Alchemy resource record, or provide a stable public state API.
- The sample provider does not implement cloud credentials, drift reads, env adoption, content
  hashing, rollback, or deployment deletion. Its `delete` is a no-op because the runner owns the
  disposable backend. Removing a component installation or destroying retained data is not tested.
- Env writes and a Convex push are separate operations. A mount-validation failure occurs after the
  push; it does not roll back that push. The provider validates mounts before removing env. An env
  name first written by a failed apply can remain after recovery, because this prototype removes
  only names owned by the last committed output. A production provider needs durable env ownership
  across failed writes; this sample does not test that behavior.
- The local `convex dev` process also watches and pushes source changes. Its rename and restoration
  pushes can run alongside explicit CLI calls. The test proves the mounted state and runtime after
  the provider push; it does not prove that only that push installed the component.

## Source boundaries

- Native Alchemy
  [binding registration](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Resource.ts#L378),
  [namespace state](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/State/ResourceState.ts#L28),
  and
  [namespace traversal](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/FQN.ts#L34).
- Convex's public
  [getFunctionAddress](https://docs.convex.dev/api/modules/server#getfunctionaddress) is exported,
  but using it on component roots and decoding their reference strings is the private part of this
  adapter.
- The mounted-tree read uses the private `/api/query_batch` and
  [`_system/frontend/components:list`](https://github.com/convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/npm-packages/system-udfs/convex/_system/frontend/components.ts#L4).
- The published Convex provider used by the earlier research has
  [binding type `never`](https://github.com/samebase/alchemy-convex/blob/0377f23edd121f510c9d815e62e257832698ee1d/src/Deployment.ts#L144).
  This experiment supplies the missing provider behavior locally.

## Summary

One explicit association between an installed component and a native Alchemy namespace can group
package resources without a resource catalog. The local lifecycle tests support that approach. A
supported Convex component-reference API and a production provider extension remain separate work.
