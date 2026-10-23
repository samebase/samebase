# Convex component and Worker binding experiments

Date: 2026-10-23. Status: local experiments, not an accepted product contract.

## Decision

Start with native exported Alchemy resource Effects and normal Convex component code. Keep the
component import explicit in `convex.config.ts`. The package can own its Worker and supporting
resources in an ordinary TypeScript module; the app imports them into its existing stack.

The first three experiments tested environment wiring, not enough of Alchemy's composition model.
The initial recommendation of a shared feature descriptor was premature. A follow-up tested native
resource modules, native deployment-time bindings, and direct runtime imports. These are separate
questions from discovering which Convex component is actually mounted.

This replaces the R2-first pilot in the
[earlier investigation](2026-10-22-convex-component-alchemy-resources.md#recommendation). The
central question is whether one installed component can own a usable compute dependency. Storage
retention, email routes, and repeated mounts do not need to be part of that first test.

## Common test

Each experiment uses normal Convex config, schema, actions, mutations, queries, and generated APIs.
A component action sends text to an HTTP Worker. The Worker checks a secret, trims the text, and
converts it to uppercase. The component saves the result in its own table. A host query reads it.
The resource association must come from the configuration used by this runtime path.

The tests use an anonymous local Convex backend and Cloudflare's local Worker runtime. They do not
apply resources to a cloud account. They do not test Samebase's component-resource UI or production
authorization. The samples are disposable development apps, not production job APIs.

## Results

| Approach                        | Local runtime                    | Connection source                                                                | Main cost                                                                |
| ------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Explicit component registration | Passed with Alchemy local Worker | Deployment URL and component path passed to an Alchemy Action                    | Repeated mount identity, a configuration table, and a custom update step |
| Native resource modules         | Passed with Wrangler/workerd     | Imported Worker and secret Outputs supplied to typed Convex env                  | Explicit component environment mapping                                   |
| Analyzed component graph        | Passed with Alchemy local Worker | Actual Convex analysis response, including mount path and environment references | Private deployment protocol and analysis before resource declaration     |
| Native provider bindings        | Passed with Alchemy local Worker | Native binding records resolved by Alchemy and consumed by provider reconcile    | Convex provider extension; mount and env mapping remain explicit         |
| Native Output runtime bridge    | Passed with Wrangler/workerd     | Shared Ref expression captured at construction and read through runtime context  | Runtime bundle, context adapter, and state fixture; no provider apply    |

Reproduction commands and the complete code are in the isolated probes:

- [Explicit registration](experiments/component-binding-explicit/README.md#run).
- [Native resource modules](experiments/component-binding-declaration/README.md#run).
- [Graph discovery](experiments/component-binding-graph/README.md#run).
- [Native provider bindings](experiments/component-native-bindings/README.md#run).
- [Native runtime bridge](experiments/component-binding-declaration/RUNTIME_IMPORT.md#passing-path).

### A. Explicit registration

The app mounts `jobs` normally. Alchemy declares the Worker and then calls
`convex run --component jobs jobs:configure`. The mutation writes the URL and secret into that
component's configuration table. The action returns a nonsecret association using the same target
and the actual Worker FQN.

This is a real connection to an installed component. It requires no new function-definition
language. It also repeats the component path in the host config and provisioning code. Each job
reads a configuration row before it calls the Worker.

A repeat run exposed an update defect in the first version. The Worker received a new secret, but
Alchemy skipped the Action and left the old secret in the component. Alchemy beta.83 hashes Action
inputs with `JSON.stringify`, while `Redacted` values serialize without their contents. The repaired
probe adds a SHA-256 revision of its random 256-bit secret to the Action input. This revision is an
update dependency, not an authentication secret or part of the public association.

The supervisor separately reproduced the equal Action hashes for two different synthetic secrets.
Provider 0.8.0's deployment hash uses the actual environment values, including unwrapped secrets.
That provider behavior was checked in source; cloud secret rotation was not tested.
[Alchemy Action hashing](https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Util/sha256.ts#L24),
[Convex deployment hashing](https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/Push.ts#L301).

### B. Native resource modules

The revised sample exports an Alchemy `Random` secret and a Worker from `feature/alchemy.ts`.
`infrastructure.ts` imports and yields them, then passes the Worker URL and secret Outputs to
`Convex.Deployment.env`. Reusing those exports registers each resource once. The host config uses
ordinary `app.use` and typed component env. One plain string names the component mount and the
association; no feature descriptor or mount adapter is needed.

This replaces `host.ts`, `binding.ts`, `convex-adapter.ts`, and `feature/definition.ts`. The local
construction fixture is separate from the author code. It substitutes local Worker and secret
outputs, so it does not claim to test Random's provisioning lifecycle.

Two concrete import tests found the execution boundary. Importing the native resource module into
the real Convex config failed esbuild on Node built-ins, even without yielding the resource. A named
constant exported from a leaf component config could be read in Node, but importing a config that
mounts a child failed because `componentDefinitionPath` was absent. Neither trick is a general way
to share live config objects. The working sample keeps the actual component import in the host
config and imports no Alchemy code there.

This probe constructs real Alchemy resources with provider execution disabled. Its local runner
evaluates their props, resolves the Worker URL to localhost, and passes those values to Wrangler and
the Convex CLI. Thus it proves native resource reuse, Output wiring, Convex type generation, and
runtime use. It does not prove an Alchemy cloud apply or the Convex provider's deployment lifecycle.

Separate execution entrypoints are compatible with a feature that owns both its code and its
infrastructure. Alchemy itself supports a separate plain Worker handler, and Convex supports
declared component environment bindings.
[Alchemy runtime forms](https://alchemy.run/infrastructure-as-effects/runtime/#effect-handlers-vs-async-handlers),
[Convex component environment](https://docs.convex.dev/components/authoring#environment-variables).

### C. Discovery from the component graph

The app's normal `app.use` is authoritative. The probe asks the real Convex CLI to write its bundled
push request, then submits that request to the local backend's private `/api/deploy2/start_push`
endpoint. The response supplies the mounted component path, definition path, and symbolic
environment references. A small explicit registry maps the definition path to an Alchemy companion.
Convex does not discover that companion itself.

The analysis succeeded while both required root environment values were absent. It returned the
references needed to fill them. No optional validators, dummy values, or fake component-definition
objects were needed. The local pipeline then created an Alchemy Worker, applied the discovered
environment bindings, pushed the component, and ran the job.

This establishes that ordinary Convex configuration can drive the association. It also exposes the
remaining boundary. A backend must exist before this analysis can run, and the graph must be known
before its Workers can be declared. The experiment uses these stages explicitly. It does not prove
one-pass provisioning of a fresh cloud deployment from one Alchemy stack.

The CLI's checked-component TypeScript schema does not describe the environment fields returned by
the tested backend. The experiment therefore validates the sourced response shape and pins its
versions. A public Convex analysis/export hook would remove this unsupported boundary. Until then,
this is a useful research path, not the preferred default for component authors.

The endpoint is a deployment phase with writes. Even its dry run commits schema changes for
validation. It skips the final deployment and handles index differences in a throwaway transaction.
It must not be treated as a read-only inspection API for an existing production deployment.
[Pinned backend behavior](https://github.com/get-convex/convex-backend/blob/72ce13c379fe6dbdfc305bc8ad699c5663c68c2a/crates/local_backend/src/deploy_config2.rs#L427).

The supervisor's first fresh-checkout run found a startup race. The backend began listening before
Convex generated the API files needed by the analysis build. The final runner removes both generated
directories and waits for real Convex code generation before it captures the request. This keeps the
test independent of files left by an earlier run.

### D. Native Alchemy provider bindings

The [native binding probe](experiments/component-native-bindings/README.md) defines a local Convex
deployment Resource with a typed binding contract. The stack calls its real `Resource.bind` method
with a component path, Worker resource identity, and component-local env values. Alchemy resolves
the Worker Outputs and supplies the active bindings to the provider's `reconcile` method.

That method derives the root env values and nonsecret component association from the same records.
It sets env, runs the ordinary Convex CLI push, and checks the mounted path before returning
attributes. Normal component actions, schemas, and generated APIs remain unchanged. This is a
provider extension experiment, not an API available in `@samebase/alchemy-convex` 0.8.0.

The supervisor independently ran initial, changed, and secret-only local applies. The component
called the local Worker and stored its result. A URL query change reached Convex. Removing a second
binding removed its env value. Secret rotation kept the URL fixed: the old secret returned 401, the
new secret returned 200, and the component saved its result. Each successful phase waited for the
committed resource state and a fresh stack output. Their associations matched the reconcile result.

Invalid URL input failed before env writes, preserved the prior env value, and left the last
successful attributes in Alchemy's failed-update state. This failure does not prove rollback after
partial external writes. The URL query change proves propagation to the same Worker, not routing to
a different Worker.

The mount name still appears in normal Convex config and binding data. A private dashboard query
checks that path after deployment; it does not establish that the mount's env mapping matches every
binding. The local provider omits production ownership checks, content hashing, rollback, and
deletion. Its purpose is to prove that native bindings can carry this connection without an Alchemy
Platform or a replacement Convex function DSL.

### E. Native Outputs inside a normal component action

Direct imports were tested before adding an adapter. A normal component action importing
`alchemy/Cloudflare` failed the real Convex push with 312 Node built-in resolution errors. A
granular Worker import failed with 184; `alchemy/Output` alone failed with 32. Moving the action to
`"use node"` failed because Convex 1.46.0 does not support that directive inside components.
Alchemy's runtime bundler still left Node imports in a full Worker declaration.

A smaller path worked. The package exports one native Ref and `Output.bind` Effect. A construction
context captures that Output and uses it in the Convex deployment environment. Alchemy's own
`Bundle.build` makes the binding safe to import in a normal component action. A small runtime
context reads the transported typed component env through Alchemy's `unpackEnvValue`. The action
then calls the Worker and saves its result normally. No custom function or schema language is
involved.

The test evaluates the captured Ref against an explicit state fixture containing the live local
Worker endpoint. Changing the FQN to `missing/Worker` fails with `InvalidReferenceError` through the
same capture path. The reference therefore selects the tested URL; it is not a decorative ID beside
an unrelated env value. The real HTTP call, stored component result, host query, and wrong-secret
401 all passed.

This proves a runtime bridge is possible. It does not import the complete Worker declaration into
the handler, discover the mounted component, or run a provider lifecycle. A Ref reads existing
resource state; it does not create a dependency on a new resource in the same apply. The build hook,
capture host, env mapping, and first-deployment ordering still need a product design. The native
provider binding probe separately tests real local Alchemy apply.

## Verification and delegation

Three agents used separate worktrees. Their first experiments covered registration, a shared
declaration, and graph discovery. The follow-up corrected the scope:

| Agent                       | Branch                           | Retained result                                                                                      |
| --------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `subscription_auth`         | `nicu-component-runtime-import`  | Native runtime import failures, a bundled Output bridge, and explicit state-fixture checks           |
| `component_contract_review` | `nicu-component-native-alchemy`  | Native exported resources replacing descriptor glue; read-only review of bindings and runtime bridge |
| `scout_dependencies`        | `nicu-component-native-bindings` | Native Alchemy apply, binding removal, secret rotation, committed state, and failed-update checks    |

The supervisor integrated the probes and independently reran their runtime commands. Focused
TypeScript and format checks passed. The graph and native binding probes also passed scoped lint.
The native module sample resets its disposable backend for repeat checks after a stale local push
caused a 401 in the first independent rerun. The binding runner waits for committed state, after
review found that its earlier reconcile marker preceded Alchemy's final state write.

The checked versions are Node 24.22.1, Convex 1.46.0, Alchemy 2.0.0-beta.83, Effect 4.0.4, and
Convex provider 0.8.0 where used. The graph probe pins backend `precompiled-2026-10-10-72ce13c`.
Standard generated Convex files and duplicate dependency lockfiles are local artifacts, excluded
from the final research diff. Local runtime state and secrets are also ignored. The full Samebase
test suite was not part of these isolated experiments.

## Next implementation boundary

Use native exported resources as the baseline. Extend the Convex provider to carry component
configuration through native Alchemy bindings. The local probe shows this works without replacing
component handlers. Keep the direct Convex config import. Keep resource IDs stable when a component
path changes.

The binding must carry runtime values and actual resource identities together. The provider should
derive the component association from the same records it applies. That removes separate display
configuration. A public mount identity and env-analysis contract is still needed for automatic
installation discovery.

Before calling the integration ready for production, implement the binding contract in the real
Convex provider and test one isolated cloud deployment, a secret change, a failed apply, and Worker
removal. Use the resolved Convex project and deployment identity in the output. The local probes use
loopback targets or construction-only handles and do not yet satisfy Samebase's production
association contract.

Keep the graph experiment as evidence for a later Convex/provider analysis hook. Do not introduce a
new language for functions and schemas to obtain this connection.
