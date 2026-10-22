# Convex component and Worker binding experiments

Date: 2026-10-23. Status: local experiments, not an accepted product contract.

## Decision

Use one shared installation declaration, normal Convex component code, and a small adapter for each
execution environment. Keep the component import explicit in `convex.config.ts`. Let the Alchemy
adapter derive the Worker, component environment values, and resource association from that same
declaration.

All three experiments ran a component-backed text job locally. The difference is the amount of
custom configuration and dependence on Convex's private deployment protocol. The shared declaration
is the best next implementation step. Discovery from Convex's analyzed graph is feasible, but needs
a deployment-analysis integration before it can replace the shared declaration.

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
| Shared installation declaration | Passed with Wrangler/workerd     | One declaration read by Convex and Alchemy adapters                              | One direct component import and small adapters                           |
| Analyzed component graph        | Passed with Alchemy local Worker | Actual Convex analysis response, including mount path and environment references | Private deployment protocol and analysis before resource declaration     |

Reproduction commands and the complete code are in the isolated probes:

- [Explicit registration](experiments/component-binding-explicit/README.md#run).
- [Shared declaration](experiments/component-binding-declaration/README.md#run).
- [Graph discovery](experiments/component-binding-graph/README.md#run).

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

### B. Shared installation declaration

The host declares one feature installation. The feature describes its Worker entry and required
binding names. The Convex adapter derives the root environment names and mounts the ordinary
component. The Alchemy adapter declares an actual `Cloudflare.Worker` and `Convex.Deployment`, using
the same names and secret. It emits the resource association from those handles and the installation
identity.

The working host config directly imports the component config and passes it to the adapter. Moving
that import inside an ordinary adapter caused repeated `start_push` server errors on the tested
Convex version. Restoring the direct import passed against the same backend. The working design does
not generate or take ownership of the app's config file. The shared declaration contains plain
settings; Alchemy does not import or execute a Convex config.

This probe constructs real Alchemy resources with provider execution disabled. Its local runner
evaluates their props, resolves the Worker URL to localhost, and passes those values to Wrangler and
the Convex CLI. Thus it proves the declaration, bindings, standard Convex type generation, and
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

## Verification and delegation

Three agents used separate worktrees and disjoint experiment directories:

| Agent                       | Branch                               | Retained result                                                                                   |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `subscription_auth`         | `nicu-component-binding-explicit`    | Explicit runtime binding, update-failure evidence, and read-only review of the shared declaration |
| `component_contract_review` | `nicu-component-binding-declaration` | Shared declaration, direct-import constraint, and local runtime verification                      |
| `scout_dependencies`        | `nicu-component-binding-graph`       | Real analyzed graph fixture, staged local deployment, and clean-start correction                  |

The supervisor integrated all three probes and independently reran their runtime commands. Focused
TypeScript and format checks passed. The graph probe also passed its focused lint check. The shared
declaration passed a repeat run with a new secret after its sample dependency setup was aligned with
pnpm 12.14.0. A separate review found no mismatch between that declaration, its runtime values, and
its association record.

The checked versions are Node 24.22.1, Convex 1.46.0, Alchemy 2.0.0-beta.83, Effect 4.0.4, and
Convex provider 0.8.0 where used. The graph probe pins backend `precompiled-2026-10-10-72ce13c`.
Standard generated Convex files and duplicate dependency lockfiles are local artifacts, excluded
from the final research diff. Local runtime state and secrets are also ignored. The full Samebase
test suite was not part of these isolated experiments.

## Next implementation boundary

Package the working shared-declaration pattern for one Worker-backed component. Keep ordinary
component handlers and the direct Convex config import. The host chooses the installation name and
an infrastructure ID. Keep that infrastructure ID stable when a component path changes.

The companion must return runtime environment values and actual resource handles together. The host
supplies the environment to `Convex.Deployment` and emits the nonsecret association in stack output.
This makes the display record a result of the working binding, rather than a separate list of
resource labels.

Before calling the integration ready for production, test one isolated cloud deployment through
provider 0.8.0, a secret change, a failed apply, and Worker removal. Use the resolved Convex project
and deployment identity in the output. The local probes use loopback targets or construction-only
handles and do not yet satisfy Samebase's production association contract.

Keep the graph experiment as evidence for a later Convex/provider analysis hook. Do not introduce a
new language for functions and schemas to obtain this connection.
