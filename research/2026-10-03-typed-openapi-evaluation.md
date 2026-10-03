# typed-openapi evaluation with Samebase provider schemas

Date: 2026-10-03. Status: Cloudflare acceptance check failed; Convex ID check passed.

## Decision

Do not replace the Cloudflare client with unmodified `typed-openapi` 4.1.0 yet. The generator
accepts the real schema, but its output does not preserve the Worker creation contract. The Zod
output also fails to load. Valibot resolves the load failure, but retains the incorrect request
types and has additional generated-code type errors.

The approved order was to test the real schemas, replace Cloudflare in place, then extract a private
package. This evaluation stopped at the first step. The application implementation, dependencies,
`@samebase/sure`, and schema drift commands remain unchanged.

The next useful change is to fix and retest the generator's handling of shared request/response
schemas. Converting application callers or moving files into a package before that would hide the
failed acceptance check.

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
