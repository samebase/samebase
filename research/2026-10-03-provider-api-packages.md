# Provider API packages

Status: research and recommendation, not an accepted implementation plan.

Reviewed on October 3, 2026, against `origin/main` at `92be76174c28fb3c973ab4db48638319bcefc9b7`.

## Recommendation

Extract the existing Cloudflare API client into a private workspace package named
`@samebase/cloudflare-api` at `packages/cloudflare-api`. Use it as the first example of a provider
package whose dependencies point away from the application. Follow with
`@samebase/convex-management-api`, then `@samebase/github-api` in separate changes.

The suggestion is sound. The Cloudflare client has no Convex database or function-context imports.
Its remaining app dependencies are limited and identifiable. The package can own provider requests
and response validation while Samebase retains authority, credentials, stored state, and
provisioning decisions.

Package extraction does not require changing SDKs. Preserve the current Cloudflare client for the
first extraction. Keep Octokit for GitHub. Consider a shared generator only after the Cloudflare and
Convex packages expose actual duplication worth removing.

### Private-package scope

The immediate benefit is code organization: one place owns Cloudflare contracts, transport,
generation, and tests. The app consumes explicit exports and keeps its product rules. Existing
schema maintenance continues under that package owner.

For the first extraction, retain the current API coverage and `@samebase/sure`. The user wants to
discuss its tuple result shape and a possible Evolu replacement separately. Evolu's
[Result](https://www.evolu.dev/docs/api-reference/common/Result/type-aliases/Result) uses
discriminated success/error objects. Choosing the result representation is separate from choosing a
dependency; neither decision is required to organize this code into a private package.

Use ESM for the package runtime. The current generated file mixes ESM exports with `require()` calls
for AJV helpers. Native ESM rejects those calls. Generation must produce valid ESM without runtime
`require()`; do not add a runtime compatibility shim. This is a concrete module-format check, not a
requirement to support every JavaScript runtime.

Public API stability, publishing private dependencies, registry releases, and packed external
consumer tests belong to a later public-release milestone. Keep direct dependency declarations and
the rule against importing app code now, because both make the internal package useful.

### AJV update check

The existing AJV patch addresses a different problem: it adds the named `standaloneCode` export used
by our generator imports. [PR 795](https://github.com/samebase/samebase/pull/795) records why the
patch was added. It does not change how standalone validators import runtime helpers.

On October 3, 2026, the npm registry and GitHub identify
[8.20.0](https://github.com/ajv-validator/ajv/releases/tag/v8.20.0) as the latest release. A
separate installation of that unpatched version still has no named `standaloneCode` export. Its
default export works, but generating with `code.esm: true` still emits `require()` for `ucs2length`
with a string-length schema and for `equal` with an object-constant schema. Both generated modules
fail native ESM import. [Upstream issue 2598](https://github.com/ajv-validator/ajv/issues/2598)
remains open. Updating AJV alone does not resolve either issue. This probe did not change repo
dependencies.

The proposed [ESM generation fix, PR 2618](https://github.com/ajv-validator/ajv/pull/2618), is open
and unmerged. The earlier [named-export PR 2352](https://github.com/ajv-validator/ajv/pull/2352) was
closed without merging. These are separate upstream changes.

## Evidence and scope

The current Cloudflare client imports the MCP transport, JSON helpers, a recorder type, and
validation logging from outside its folder. It already receives credentials and transport as
arguments. See the
[client imports and request contract](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/convex/cloudflareApi/client.ts#L1-L35).

The extraction reaches nine production modules that directly import the client or generated types.
Only three send requests: `cloudflareResources`, `cloudflareAccountDiscovery`, and
`cloudflareProviderAccess`, with 22 request calls in total. This is a bounded migration, but more
than a folder move.

The generated contract covers 107 paths and 176 operations. It includes Workers, Workers Builds,
account inventory, and token verification. Its four generated files total about 5.9 MB of source. A
package move does not reduce that source or prove a smaller deployment. Retain this scope initially.
The
[accepted spec](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/specs/104_CLOUDFLARE_MCP_API_VALIDATION_SPEC.md#L23-L58)
deliberately includes whole owned API families so drift checks detect new operations.

## Package boundary

| Move to the package                                              | Keep in Samebase                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Typed method/path request functions and provider errors          | Organization and repository authorization                                    |
| Direct REST transport and provider-specific MCP request protocol | Mapping stored auth methods to a transport                                   |
| Response parsing, validation, and generated declarations         | OAuth callbacks, credential storage, refresh locks, connection state         |
| Schema snapshot, generator, and drift check                      | Worker naming, preview migration, Convex deploy keys, provisioning workflows |
| Provider fixtures and client/transport tests                     | Write approvals, audit persistence, user-facing reconnect instructions       |

Do not move `cloudflareResources.ts` whole. Its
[imports and models](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/convex/cloudflareResources.ts#L1-L35)
already mix API types with Convex errors, Samebase preview rules, and Convex deploy keys.

Use this dependency direction:

```text
Samebase authorization, stored credentials, and workflows
    -> @samebase/cloudflare-api
        -> direct Cloudflare REST or Cloudflare MCP
```

### Small public API

Use two explicit export paths initially:

- `@samebase/cloudflare-api/client`: the existing typed request functions, provider error, transport
  type, and request-result type.
- `@samebase/cloudflare-api/types`: generated provider types used by application code.

Keep generated validator internals and fixtures private. Do not introduce operation wrappers, a
plugin registry, or a shared provider base class. The existing method/path call shape can remain
intact.

Move generic MCP request mechanics with the provider code. Keep OAuth registration, exchange,
refresh, and organization binding in the app. The
[current MCP module](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/convex/cloudflareMcp.ts#L1-L38)
uses fetch and JSON protocol handling. Its `"use node"` directive needs a runtime review during
extraction; a package must not silently change its consumers' execution environment.

Keep the existing API call recorder as a callback, but define its narrow structural contract in the
package. The app can pass its existing recorder. Replace imports of app validation logging with one
diagnostic callback. Samebase should keep its current log topics and safe projection. In particular,
AJV instance paths and parameters can contain private provider data; do not pass them directly into
logs. This protection has an
[existing test](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/convex/cloudflareApi/client.test.ts#L148-L207).

Use the existing `@samebase/dependent` and `@samebase/sure` packages where they fit. Avoid creating
a general JSON or provider package just to relocate a few helpers. The provider package must have no
runtime or type imports from `apps/samebase`.

## Packaging work that a folder move would miss

1. **Generated module format.** I ran a native Node ESM import of the current validator file. It
   exits with code 1: `require is not defined in ES module scope`. The file has ESM exports but uses
   `require()` for AJV's `equal` and `ucs2length` helpers. The generator already sets
   `code.esm: true`. Fix output through generation and verify the resulting module; do not hand-edit
   generated JavaScript. [AJV documents standalone ESM output](https://ajv.js.org/standalone.html).
2. **Declared dependencies.** AJV is currently an app dev dependency although the generated
   validators use its runtime helpers. The package must declare every remaining runtime and
   declaration dependency directly, including `openapi-fetch`, `@samebase/sure`, AJV helpers, and
   `openapi-typescript-helpers`. Generation dependencies belong in its dev dependencies.
3. **Generator paths.** Output paths, working directory, formatter calls, and tracked-path helpers
   currently assume the app directory. Move them with the package and update tracked-file
   references. See
   [generator paths](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/scripts/generate-cloudflare-api.ts#L9-L45)
   and
   [formatting calls](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/scripts/generate-cloudflare-api.ts#L843-L850).
4. **Test ownership.** The client test imports the app's Worker-create body builder. Keep that
   product assertion in an app test; package tests must not import the app. Provider fixtures also
   serve six app test files, so give shared test data a deliberate test-only location. No current
   Cloudflare compile-only request test was found. Add a narrow package type check for invalid
   paths, missing path parameters, and invalid bodies when introducing its exports.
5. **Check registration.** The workspace already includes `packages/*`, and Vite+ discovers package
   tests. However, root `check:packages` and `typecheck:packages` list packages explicitly. Register
   the new package and ensure its generator script has lint and TypeScript coverage. See
   [workspace checks](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/package.json#L26-L42).
6. **Drift ownership.** Make `generate` and `verify` package commands. Update the app scripts,
   accepted spec paths, and this automation's command together. Preserve its schedule settings.
   Delete obsolete app script entrypoints after callers move.

Follow the repo's private source-package model, such as
[logo-model](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/packages/logo-model/package.json#L1-L38).
Use `workspace:*` and the root lockfile. A separate npm release process is not needed for this
internal example.
[pnpm guarantees local resolution for workspace dependencies](https://pnpm.io/workspaces#workspace-protocol-workspace).

Keep the package bundled into Convex. Convex already bundles imported dependencies; marking a
private workspace package as a server-installed external dependency would require a different
distribution model. [Convex bundling documentation](https://docs.convex.dev/functions/bundling).

## How the next providers fit

| Package                           | Reuse from the Cloudflare example                                                                | Provider-specific work to retain                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `@samebase/convex-management-api` | Generator ownership, typed client exports, validation, diagnostics, drift command, focused tests | Lossless JSON parsing, schema-derived decimal ID paths, rejection of unsafe non-ID numbers, separate OAuth-token parser |
| `@samebase/github-api`            | Explicit configuration, no app imports, provider tests, app-owned authorization and storage      | Existing Octokit REST and auth libraries, GitHub App signing, installation scope, pagination, user-token exchange       |

The
[Convex client](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/convex/convexManagementApi/client.ts#L1-L35)
already has a similar dependency structure. Move its lossless parsing and generated ID paths
together. Token/team-slug discovery that uses stored connection state stays in the app. Update the
path and command references in
[spec 103](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/specs/103_CONVEX_API_VALIDATION_SPEC.md#L54-L100)
without weakening those guarantees.

GitHub needs a different implementation behind the same ownership rule. Its
[client module](https://github.com/samebase/samebase/blob/92be76174c28fb3c973ab4db48638319bcefc9b7/apps/samebase/convex/githubApp.ts#L1-L23)
already uses Octokit but reads generated Convex environment variables. Pass the existing
configuration object into the package instead. Keep authority checks and credential persistence in
the app. Do not replace Octokit with new OpenAPI generation for consistency. GitHub's current
safe-number checks also differ from Convex's lossless parsing; extraction must not claim to make
them equivalent.

## Suggested migration and acceptance checks

Use one Cloudflare implementation PR with three reviewable commits:

1. Move generator and generated contract, declare package dependencies, and make validator output
   valid for its declared ESM runtime.
2. Move the client and transport, remove app dependencies, update all consumers and test owners, and
   delete the old files.
3. Update package checks, drift automation, references, and a short README showing a typed
   account-list request and the package's supported API families.

Keep request behavior and schema scope stable. Prove the following before treating this package as
the example for later providers:

- Package type checking and focused client/transport tests pass with no app imports.
- Generated ESM validators load under Node, and Convex bundles the package successfully.
- Existing app tests for discovery, access, provisioning, and safe logging pass at their current
  owners. Preserve MCP versus REST routing and write-approval order.
- Regeneration leaves no uncommitted diff after the move; package verification owns the new paths.
- The app type check accepts the new exports and rejects invalid request shapes.

Then extract Convex Management API. Use that second extraction to decide which generation mechanics
are truly shared. Extract GitHub last, retaining Octokit. A universal provider client would conceal
real differences in transport, IDs, and authentication.

## What this research proves

Baseline validation: the existing Cloudflare client and MCP tests passed, 16 tests across two files
in 805 ms. Command:

```sh
pnpm exec vp test apps/samebase/convex/cloudflareApi/client.test.ts apps/samebase/convex/cloudflareMcp.test.ts
```

Source and dependency inspection supports the package split. The native ESM probe identifies one
concrete portability problem. This research does not prove an extracted package build, deployment
size, or SDK replacement. No application implementation changed.

Two read-only agents mapped Cloudflare dependencies and the Convex/GitHub follow-ons. The main
review checked workspace integration, official package/bundling documentation, and the ESM probe. No
additional worktrees were used by those agents.
