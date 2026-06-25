# MCP Convex Function Exposure

## Document Control

- Status: Draft
- Owner: Samebase platform
- Date: 2026-06-24
- Related docs:
  - `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
  - `docs/repo-documentation-standard.md`
  - `apps/samebase/convex/functions.ts`
  - `apps/samebase/convex/toolRuntime/catalog.ts`
  - `apps/samebase/convex/mcp/http.ts`

## Summary

Expose Samebase MCP tools from the same app-owned Convex function definitions that power the web
app, instead of maintaining a separate MCP tool catalog with duplicated names, validators, and
access requirements.

The proposed shape is:

1. Add an optional `mcp` field to Samebase's custom `query`, `mutation`, and `action` builders.
2. Treat `mcp` presence as the opt-in. No `expose: true` flag.
3. Reuse the function definition's `access`, `args`, and `returns` as the single source of truth.
4. Keep MCP presentation metadata explicit because MCP tools are public-facing agent UI.
5. Execute MCP calls through a viewer resolved from the MCP access token's Samebase `userId`, then
   enforce the same `access_*` key as the web app function.

The first concrete target is the existing app creation action:

```ts
export const createRepository = action({
  access: "access_app_create",
  args: createRepositoryArgs,
  returns: createRepositoryReturns,
  mcp: {
    name: "vault.actions.createRepository",
    description:
      "Create a new Samebase app by creating a GitHub repository and provisioning Convex and Cloudflare.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: async (ctx, args) => {
    return await createRepositoryForViewer(ctx, args);
  },
});
```

## Problem

The current MCP runtime is moving in the right direction by exposing only `create_app`, but it still
has separate MCP-specific definitions for:

1. the tool name,
2. the tool input schema,
3. the required OAuth scope,
4. the executor dispatch, and
5. the product action it calls.

That duplication will drift. The web app already defines a public Convex action with an `access`
key, validators, return shape, and handler. MCP should reuse that function definition as much as
Convex's runtime model allows.

## Goals

1. Make MCP an alternate client surface for selected Samebase app operations.
2. Avoid duplicating Convex function access keys, argument validators, or return validators in an
   MCP catalog.
3. Keep MCP exposure explicit at the function definition callsite.
4. Use the same `access_*` vocabulary for app functions and MCP grants.
5. Keep MCP tool names stable and intentionally public-facing.
6. Preserve room for LLM-facing descriptions, safety labels, and display hints that do not belong in
   normal Convex function metadata.

## Non-Goals

1. Automatically exposing every public Convex function.
2. Making MCP access tokens valid for browser Convex APIs.
3. Replacing Convex Auth or feeding MCP tokens into `ctx.auth`.
4. Inferring public MCP tool names from file paths or export names.
5. Treating GitHub, Cloudflare, or Convex provider APIs as Samebase MCP tools.
6. Solving broad query/mutation bridging in the first implementation if action exposure is enough
   for app creation.

## Design

### Function-level MCP opt-in

The `mcp` field is the opt-in. If a function definition has no `mcp` field, it is not exposed to
MCP.

Do not add `mcp.expose`. The presence of `mcp` already means the function is intentionally public
through the MCP server.

### Explicit public tool names

MCP tool names are public API and public UI for agents. They should not be inferred from module
paths by default.

Use the Samebase Convex reference style without the `api.` prefix:

```ts
mcp: {
  name: "vault.actions.createRepository",
}
```

This is close enough to the Convex function path to preserve developer familiarity while avoiding
punctuation such as `/` and `:` in public tool names.

Do not infer names in v1. At the `action({ ... })` callsite, the wrapper does not know which module
export name will receive the returned registered function. A build-time AST pass could infer the
name later, but that would make file/export renames silently change a public MCP tool contract.

### Access keys as MCP scopes

The function's `access` key is the MCP delegated scope. For example:

```ts
access: "access_app_create";
```

means:

1. the signed-in Samebase user must currently have `access_app_create`,
2. the MCP grant must include `access_app_create`, and
3. `tools/list` only includes the tool when both conditions are satisfied.

`access_mcp` remains the permission to authorize and manage MCP grants. It is not a replacement for
the operation-specific access key.

### Arguments and return validators

The Convex function's `args` and `returns` validators are the source of truth.

The MCP runtime needs a JSON Schema input shape for `tools/list`. The implementation should derive
that schema from the Convex validators for the supported validator subset. If Convex validators
cannot express an LLM-friendly description for a field, `mcp` may add presentation-only hints, but
it must not restate required fields or runtime validation.

Allowed MCP presentation metadata:

```ts
mcp: {
  name: "vault.actions.createRepository",
  description: "...",
  safety: "write",
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputDescriptions?: {
    name: "Name for the new app and GitHub repository.",
  },
}
```

Not allowed:

```ts
mcp: {
  args: { ... },
  requiredScopes: ["..."],
}
```

`annotations` are required for every exposed tool because ChatGPT app review expects explicit
`readOnlyHint`, `openWorldHint`, and `destructiveHint` values. These hints describe tool behavior
for MCP clients; they do not replace the product's access checks, validators, or audit behavior.

The generated `chatgpt-app-submission.json` file is a submission artifact for the current ChatGPT
Apps form. It may live in the repo so reviewed form inputs are reproducible, but runtime behavior
stays source-of-truth in the function contracts, MCP HTTP descriptor mapping, and tests. Regenerate
or manually review the submission artifact whenever the exposed tool set, tool descriptions,
annotations, or review test cases change.

### Viewer resolution

Normal web-app calls resolve `ctx.viewer` from Convex Auth in `apps/samebase/convex/functions.ts`.

MCP calls must not pretend that an MCP bearer token is a Convex Auth session. The MCP HTTP route
already validates opaque MCP access tokens and obtains a Samebase `userId`. The runtime needs an
equivalent viewer resolver that starts from that `userId`:

```ts
const viewer = await resolveViewerForUserId(ctx, userId);
assertAuthenticatedViewerAccess(requiredAccess, viewer);
```

That resolver should share the same role/access projection logic as the existing Convex Auth
resolver.

### Execution model

The target end state is one product implementation per operation, not one implementation per
transport.

For actions, the first implementation can share a helper directly:

```ts
async function createRepositoryForViewer(
  ctx: Pick<ActionCtx, "runAction" | "runQuery" | "runMutation"> & {
    viewer: AuthenticatedAppViewer;
  },
  args: CreateRepositoryArgs,
) {
  // Product implementation.
}
```

The web action calls it with a viewer resolved by Convex Auth. The MCP bridge calls it with a viewer
resolved from the MCP token's `userId`.

Queries and mutations need a separate design decision. An MCP HTTP action can call
`ctx.runQuery(api.some.publicQuery, args)`, but that public query would still resolve `ctx.viewer`
from Convex Auth, not from the MCP token. An HTTP/action context also cannot synthesize a
`QueryCtx`/`MutationCtx` with direct `db` access for arbitrary handlers.

For v1, expose action-backed operations first. Before exposing query or mutation functions, choose
one of these shapes:

1. register explicit internal MCP bridge functions for selected query/mutation operations,
2. extract shared implementation helpers that can be called from both public functions and internal
   MCP bridge functions, or
3. add a custom-builder/codegen layer that emits an MCP bridge at definition time.

Do not expose query/mutation functions by calling the public function reference unless the auth
context problem is solved.

## Proposed Type Shape

Extend the shared function policy type:

```ts
type AppFunctionMcpMetadata = {
  name: string;
  description: string;
  safety: "read_only" | "write" | "destructive" | "proposal_only";
  annotations: {
    readOnlyHint: boolean;
    openWorldHint: boolean;
    destructiveHint: boolean;
  };
  inputDescriptions?: Record<string, string>;
};

type AppFunctionDefinition<...> = {
  access: Access;
  args?: ArgsValidator;
  returns?: ReturnsValidator;
  mcp?: AppFunctionMcpMetadata;
  handler: (...args) => ReturnValue;
};
```

The `mcp` metadata does not include access, args, or returns.

## First Rollout

### Phase 1: Metadata and registry

1. Add `mcp?: AppFunctionMcpMetadata` to the custom function definition types.
2. Register MCP metadata from the custom builder into a module-local registry.
3. Add tests proving the registry derives:
   - tool name from `mcp.name`,
   - required access from `definition.access`,
   - input schema from `definition.args`,
   - tool annotations from `mcp.annotations`,
   - output metadata from `definition.returns` where needed.

### Phase 2: App creation migration

1. Rename the public MCP tool from `create_app` to `vault.actions.createRepository`.
2. Replace `apps.create` with `access_app_create`.
3. Move the app-creation MCP metadata onto `vault.actions.createRepository`.
4. Delete the duplicate `createAppInputSchema` and catalog entry once the derived path works.
5. Keep the explicit `createRepositoryForViewer` helper so web and MCP calls share the product
   implementation.

### Phase 3: Consent and listing

1. `tools/list` should include only MCP-exposed functions whose `access` key is included in the MCP
   grant and still held by the current user.
2. Consent UI should display `access_*` scopes with product copy, not raw implementation jargon.
3. Existing grants should remain valid only if their scopes still map to currently exposed MCP
   functions.

### Phase 4: Query/mutation decision

Before adding query/mutation tools, write down the chosen bridge strategy and add one small example.
Do not generalize the bridge from action behavior alone.

## Open Questions

1. Can we derive good enough JSON Schema from Convex validators without relying on unstable internal
   validator fields?
2. Should MCP output schemas use Convex `returns`, or should v1 omit output schemas and rely on
   normal tool text/structured content?
3. Do we need `mcp.title` or is `description` enough for ChatGPT/Codex presentation?
4. Should tool names include `vault.actions.createRepository` or
   `samebase.vault.actions.createRepository` for registry/global clarity?
5. Which existing public queries/mutations are good candidates for the first non-action bridge?

## Validation

The implementation should add or update tests that prove:

1. A function with no `mcp` metadata is absent from `tools/list`.
2. A function with `mcp` metadata appears under its explicit name.
3. The MCP required scope equals the function's `access` key.
4. MCP `tools/list` includes the explicit tool annotations.
5. MCP execution fails if the grant has the access key but the user no longer has it.
6. MCP execution fails if the user has the access key but the grant does not.
7. The normal web action still uses Convex Auth and does not accept MCP tokens.
8. App creation has one product implementation shared by the web action and MCP bridge.

## Current Recommendation

Proceed with action-only metadata for `vault.actions.createRepository` first.

This gives Samebase the product surface we want for ChatGPT/Codex installation while keeping the
runtime honest about Convex Auth. Query and mutation exposure should wait until the bridge strategy
is explicit.
