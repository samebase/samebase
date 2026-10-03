# typed-openapi evaluation with Samebase provider schemas

Date: 2026-10-03. Status: Cloudflare acceptance check failed; Convex ID check passed.

This section records the earlier `typed-openapi` trial. The later
[Hey API replacement](#hey-api-replacement) implements the Cloudflare migration.

## Decision

Do not replace the Cloudflare client with unmodified `typed-openapi` 4.1.0 yet. The generator
accepts the real schema, but its output does not preserve the Worker creation contract. The Zod
output also fails to load. Valibot resolves the load failure, but retains the incorrect request
types and has additional generated-code type errors.

The approved order was to test the real schemas, replace Cloudflare in place, then extract a private
package. This evaluation stopped at the first step. The application implementation, dependencies,
`@samebase/sure`, and schema drift commands remain unchanged.

Local adapter fixes were tested, but the shared request/response reference limitation still blocks
this generator. The two upstream PRs described below were closed. Permission to fork and investigate
did not authorize their submission. Further upstream submissions require explicit user approval.

## Scope

- Samebase base: `92be76174c28fb3c973ab4db48638319bcefc9b7`.
- Generator: `typed-openapi` 4.1.0, upstream commit
  [`929ad80`](https://github.com/astahmer/typed-openapi/tree/929ad80bb6c2ed1a50f793b3c9860b5915d143ea).
- Runtimes: the app's Zod 4.3.6 and Valibot 1.4.2.
- Cloudflare input: the complete checked-in family subset, 107 paths and 176 operations.
- Convex input: the complete checked-in Management API document, 48 operations.
- Validation used recorded Cloudflare payloads and the existing Convex ID contract tests. No live
  provider requests were sent.

## Cloudflare findings

### Generated Zod code fails during import

All 176 operations generate successfully. Import then fails at `workers_export_config`:

```text
TypeError: workers_durable_object_export_variants.extend is not a function
```

The referenced value is a Zod union. The generator applies an object-only method when processing the
discriminator mapping. This happens before any request can run. The
[Zod emitter](https://github.com/astahmer/typed-openapi/blob/929ad80bb6c2ed1a50f793b3c9860b5915d143ea/packages/typed-openapi/src/runtimes/zod/index.ts#L117)
shows the mapping branch that emits `.extend(...)`.

The supported Valibot output loads. It accepts the recorded completed and running build fixtures,
plus a reduced retry-metadata fixture, through both generated schemas and the generated client. The
generated schemas reject a numeric trigger source in all three cases. The probe sends only valid
payloads through the generated client. This resolves the import problem for that runtime; it does
not resolve the request type problem below.

### Worker creation requires response-only fields

The upstream create operation refers to `workers_Worker` through `allOf`. That shared schema marks
`id`, `created_on`, `updated_on`, and `references` as read-only. Those fields belong to responses.

The generated create body still requires them. A compile check that assigns Samebase's current
`Writable<workers_Worker>` to the generated request body fails with TS2322. The first reported field
is `created_on`, which the current input correctly omits.

This affects the real
[Worker creation call](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/convex/cloudflareResources.ts#L264).
Providing fake server fields or casting the body would hide the problem.

The upstream
[read/write conversion](https://github.com/astahmer/typed-openapi/blob/929ad80bb6c2ed1a50f793b3c9860b5915d143ea/packages/typed-openapi/src/schema-ir/read-write.ts#L5)
explicitly preserves named references as shared schemas. Changing the validation runtime therefore
does not fix this. A generator fix or a separate transformation of request schemas is needed.

### Generated output has additional TypeScript constraints

The default runtime sidecar mode adds `@ts-nocheck` to the generated implementation. Disabling that
mode with `--no-runtime-types` exposes four Valibot errors for generated `v.literal(null)` calls.
The generated constructor also uses a parameter property, which conflicts with the app's
`erasableSyntaxOnly` setting.

A build can compile that constructor syntax. It does not fix the request model. These findings are
separate from the AJV CommonJS helper problem that led to this investigation.

Further acceptance checks remain open: nullable Worker errors and messages, missing required
response fields, unknown fields, error envelopes, safe logging, and defaults in partial objects. The
failures above are sufficient to stop adoption, but fixing them would not prove these remaining
contracts.

## Root-cause investigation and upstream fixes

### Internal dependencies and existing reports

Version 4 uses `@apidevtools/swagger-parser` 12.1.0 to
[bundle the OpenAPI input](https://github.com/astahmer/typed-openapi/blob/929ad80bb6c2ed1a50f793b3c9860b5915d143ea/packages/typed-openapi/src/generate-client-files.ts#L171).
Its own `openApiToIr` converter builds a common schema representation. Its own TypeScript emitter
and runtime adapters then produce the output. AJV is not involved. Version 4 replaced the earlier
TypeBox code generator in [PR #130](https://github.com/astahmer/typed-openapi/pull/130).

Before submitting fixes, searches of open and closed upstream issues and PRs found no report that
directly covered these failures. Upstream main was the published 4.1.0 commit. The related
[nullable-union PR #119](https://github.com/astahmer/typed-openapi/pull/119) and
[regression fixes in PR #160](https://github.com/astahmer/typed-openapi/pull/160) were already
merged and did not fix them. The original read/write implementation explicitly documented its
limitation for shared references.

### The affected scope is larger than one endpoint

Worker creation was the first live callsite tested, not the only affected operation. A complete
176-operation scan, followed by compile checks on generated types, confirmed ten request bodies that
require top-level read-only fields:

| Operation IDs                                                                 | Incorrect required field example |
| ----------------------------------------------------------------------------- | -------------------------------- |
| `workers.domains.update`                                                      | `id`                             |
| `worker-deployments-create-deployment`                                        | `created_on`                     |
| `createWorker`, `editWorker`, `updateWorker`                                  | `created_on`                     |
| `workers.previews.create`, `workers.previews.edit`, `workers.previews.update` | `created_on`                     |
| `createWorkerVersion`, `patchLatestWorkerVersion`                             | `created_on`                     |

Five other request operations reach optional read-only fields in nested objects or arrays. These are
exposure findings, not five more reproduced compile failures. Thirty-two response operations reach
write-only fields. One confirmed response example is GET
`/accounts/{account_id}/workers/scripts/{script_name}/secrets`: the generated `secret_text` variant
requires the write-only `text` field. The response count is schema reachability, not 32 reproduced
runtime failures.

The broken `workers_export_config` union is referenced by 23 operations. Its declaration runs when
the module loads, so the import failure blocks every endpoint in that generated module.

### Shared references require a larger generator change

`stripReadWrite` removes annotated properties from inline objects, but its `ref` branch returns
named references unchanged. The resolver stores one schema per component. Both requests and
responses therefore use the same validator, including fields that belong to only one direction.

A minimal independent test uses a shared object with required `id` marked `readOnly`, required
`secret` marked `writeOnly`, and required `name`. The valid request omits `id`; the valid response
omits `secret`. Inline schemas pass. Direct references, references inside `allOf`, and references
inside nested arrays fail for both Zod and Valibot: four passing controls and twelve failures. An
independent declaration-sidecar compile check reports exactly the two corresponding missing-field
errors.

A correct fix needs request and response variants only for affected components. It must reserve
names before following recursive references, rewrite nested references and discriminator mappings,
and register the variants for dependency ordering, tree shaking, runtime output, and declaration
sidecars. Removing fields from the shared component would break the other direction. Expanding every
reference inline would break recursive schemas. No partial fix was submitted for this larger change.

### Submitted adapter fixes

The fork is [nicu-chiciuc/typed-openapi](https://github.com/nicu-chiciuc/typed-openapi), cloned
under `~/dev/forks/typed-openapi` as requested. Separate worktrees kept the two fixes independent.

- [Upstream PR #161](https://github.com/astahmer/typed-openapi/pull/161) changes two Valibot emitter
  lines to use `v.null()` for null literals and enum members. Six regression cases cover runtime
  behavior and strict generated consumer types, with and without sidecars. The full upstream
  Cloudflare snapshot had 85 invalid `v.literal(null)` calls.
- [Upstream PR #162](https://github.com/astahmer/typed-openapi/pull/162) preserves the original Zod
  member schemas instead of calling `.extend()` with mapping keys. This fixes the nested-union
  import crash and a second defect where numeric error code `10016` became string `"10016"`. It
  retains fast discrimination when the original object schemas have distinct required literal
  values. Other shapes use the existing union checks. Zod 3 multi-value numeric enums need that
  fallback too.

The Zod review caught a date-transform regression in the first candidate. The final fix retains the
object fast path and adds checks for returned `Date` values. Compound schemas still inherit the
existing generic `oneOf` transform limitations. Other runtime adapters still have their existing
discriminator handling, including the numeric mapping problem. Neither PR fixes shared read/write
references.

Validation of the submitted fixes:

- Valibot: 16 focused tests, strict generated consumers in both sidecar modes, package build, and
  package typecheck passed.
- Zod: 22 focused tests, ten snapshot cases, 24 runtime/client/type-matrix cases, package build, and
  package typecheck passed. Both Zod 3 and Zod 4 are covered.
- The patched Zod generator emits all 176 Samebase Cloudflare operations. The module imports under
  the app's Zod 4.3.6. Generated TypeScript passes with `erasableSyntaxOnly` disabled for the
  existing constructor syntax. Three recorded build fixtures are accepted through schemas and
  client; the schemas reject three invalid trigger-source mutations.
- The fixture check also found response default insertion: Zod adds `build_caching_enabled: false`
  and `path_includes: ["*"]` when those fields are absent. The original fields survive. This is an
  adoption behavior to assess, not evidence of unchanged response payloads.

No provider requests or application migration were performed during this trial. Both upstream PRs
are closed and unmerged. The shared-reference limitation still blocks adopting the generator for
Samebase.

Three follow-up agents handled upstream reports and the isolated Valibot fix, the endpoint scope
scan, and the isolated read/write reproduction plus Zod review. The parent integrated the findings
and implemented the Zod fix. The read/write prototype was retained as reproduction evidence only.

## Convex ID findings

A separate worktree tested the full 48-operation schema with the supported `transformSchema` and
`parseResponseData` hooks. The ID check passed:

- The six ID schemas become decimal-string types and validators: AccessTokenId, CustomRoleId,
  DeploymentId, MemberId, ProjectId, and TeamId.
- Raw numeric values `9223372036854775807` and `9223372036854775806` retain every digit as strings.
- The existing lossless normalizer rejects unsafe non-ID numbers before output validation.
- Arbitrary metadata fields named `id`, `projectId`, and `teamId` retain numeric values. Nullable
  IDs remain null.
- Generated validators reject invalid fields after parsing. Compile checks reject numeric path IDs,
  missing required path parameters, and the wrong method.
- Concurrent requests retain their own schema-derived ID paths. The parser hook receives only the
  response, so the probe stores each response's endpoint context in a WeakMap populated by the
  fetcher.

This verifies compatibility with the
[existing ID contract](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/specs/103_CONVEX_API_VALIDATION_SPEC.md#L46).
It does not establish that all Convex operations are ready for migration.

## Reproduce the Cloudflare failures

Use a disposable worktree at the base commit above. Run `pnpm run dev --once`, then run these
commands from `apps/samebase`. The dependency installation is for this experiment only.

```sh
pnpm add --save-dev --save-exact typed-openapi@4.1.0 valibot@1.4.2
pnpm exec typed-openapi convex/cloudflareApi/openApi.generated.json --runtime zod --validation strict --validate-side output --openapi-additional-properties-default --no-coerce --output .tmp/typed-openapi/cloudflare.generated.ts
node --experimental-transform-types .tmp/typed-openapi/cloudflare.generated.ts
```

The final command fails with the union `.extend` error. The Node flag permits the generated
constructor syntax, so it does not mask the validator failure.

Generate the alternative runtime:

```sh
pnpm exec typed-openapi convex/cloudflareApi/openApi.generated.json --runtime valibot --validation strict --validate-side output --openapi-additional-properties-default --no-coerce --output .tmp/typed-openapi/cloudflare-valibot.generated.ts
```

Save this as `.tmp/typed-openapi/request-type.ts`:

```ts
import type { components, Writable } from "../../convex/cloudflareApi/types.generated";
import type { Endpoints } from "./cloudflare-valibot.generated.types";

declare const existingBody: Writable<components["schemas"]["workers_Worker"]>;
export const candidateBody: Endpoints.post_CreateWorker["parameters"]["body"] = existingBody;
```

Save this as `.tmp/typed-openapi/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "include": ["request-type.ts"],
  "exclude": []
}
```

Run `pnpm exec tsgo --noEmit --project .tmp/typed-openapi/tsconfig.json`. It fails with TS2322 for
the response-only field requirement.

To check the generated implementation itself, regenerate the Valibot file with `--no-runtime-types`,
change the temporary config's `include` to that generated file, then rerun the same compiler
command. It reports the four null-literal errors and the constructor syntax error.

## Validation record

| Check                                                    | Result                                      |
| -------------------------------------------------------- | ------------------------------------------- |
| Cloudflare generation, full subset                       | 176 operations generated with both runtimes |
| Cloudflare Zod import                                    | Failed before requests                      |
| Cloudflare Valibot recorded build fixtures               | 3 accepted by schemas and client            |
| Cloudflare Valibot invalid fixture mutations             | 3 rejected by schemas                       |
| Existing Worker input assigned to generated request type | Failed, TS2322                              |
| Valibot output under app TypeScript settings             | Failed, 5 diagnostics                       |
| Convex lossless parser and generated client probe        | Passed                                      |
| Convex probe strict TypeScript checks                    | Passed                                      |
| Existing Cloudflare client and MCP tests                 | 16 passed in 810 ms                         |
| Existing focused Convex ID tests                         | 3 passed in 210 ms                          |

The baseline commands were:

```sh
pnpm exec vp test apps/samebase/convex/cloudflareApi/client.test.ts apps/samebase/convex/cloudflareMcp.test.ts
pnpm test --project unit apps/samebase/convex/convexManagementApi/client.test.ts -t 'preserves Convex project IDs|rejects unsafe non-ID numbers|uses response schemas'
```

Two agents contributed: one mapped the current Cloudflare boundary read-only, and one ran the
isolated Convex ID probe. The parent worktree ran the Cloudflare checks. No application replacement,
package extraction, browser test, production deployment, or merge was performed. No frontend preview
is running.

## Hey API replacement

The Cloudflare implementation now uses `@hey-api/openapi-ts` 0.99.0 with its Fetch SDK and Zod Mini.
The generator still selects all 107 paths and 176 operations in the existing provider family subset.
Application calls use the configured endpoint interface:

```ts
const { result } = await Cloudflare.GET["/accounts/{account_id}/workers/workers"]({
  client: createCloudflareClient({ token, transport }),
  path: { account_id },
});
```

Hey API generates the request types, response types, validators, and HTTP operations. Samebase keeps
provider-specific schema corrections, direct/MCP transport, error codes, timeouts, and safe audit
logs. The custom Cloudflare AJV emitter, validator registry, request overloads, and manual URL
serialization are removed. Convex retains its current implementation and lossless ID handling.

### Required configuration

- TypeScript's JavaScript compiler API is updated from 5.9.2 to 6.0.3. The existing native checker
  remains separate. TypeScript 7 does not provide the compiler API required by generators and
  Monaco. See
  [Microsoft's compatibility guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).
- SDK naming uses the supported method/path nesting configuration. No Hey API fork is needed.
- Full Zod exceeded the local Convex 64 MB module-loading limit with the complete SDK. Zod Mini
  passes the same local function deployment.
- The SDK validates data but returns the original payload. A parser input hook therefore removes
  schema `default` annotations before code generation. Otherwise Zod can accept a missing required
  field through a default that the returned payload does not contain. `json-schema-traverse` limits
  this change to schema nodes. The checked-in OpenAPI document retains its defaults, examples, and
  properties named `default`. Response values are not rewritten.
- The observed nullable Worker errors/messages correction now applies to the common input. Types and
  validators derive from the same corrected document.

The existing tests cover direct and MCP calls, token/account discovery, Worker creation, native
Builds and previews, credential rotation, cleanup, authorization, provider errors, and private-data
redaction. New boundary cases check required fields with defaults, the published secret response
without write-only text, and unchanged observed preview payloads. UUID checks now enforce the
provider schema; old placeholder IDs in tests use valid UUID values.

### Validation

- Eight affected test files: 121 tests passed in 1.22 seconds.
- App and script type checks passed.
- The local `pnpm run dev --once` setup and Convex function deployment passed with Zod Mini.
- The production app build passed.
- Convex Management API regeneration under TypeScript 6.0.3 passed with no diff.
- Cloudflare regeneration with Hey API passed with no diff after the implementation commit.
- The final client and resource checks passed: 69 tests in 374 ms.
- CI found a stale TypeScript entry in the Sidebars example's separate lockfile. After regenerating
  that lockfile, its frozen install, type check, and production build passed locally.

These checks use recorded responses and local transports. No new live Cloudflare calls or production
deployment were performed. Package extraction and the sure/Evolu decision remain separate work.
