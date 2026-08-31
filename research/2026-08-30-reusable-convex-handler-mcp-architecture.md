# Reusable Convex handler and MCP architecture

Date: 2026-08-30

Status: Research recommendation

## Recommendation

Create `@samebase/handlers` as a normal TypeScript package. Use it in Samebase and Scout.

The first package version owns the common handler contract, the ordered catalog, Convex validator
conversion, documentation projection, and the MCP server adapter. Each app keeps its public Convex
functions, product handlers, identity checks, access rules, HTTP route registration, and OAuth data.

Do not make the first shared unit a Convex component. A component cannot read the parent app's
tables or use its auth context and environment. Samebase needs those app boundaries for tool access,
OAuth token checks, browser handoff, and account deletion.

The package boundary is:

| `@samebase/handlers` owns                                     | Samebase and Scout each own                 |
| ------------------------------------------------------------- | ------------------------------------------- |
| Handler contract types                                        | Product handler code                        |
| One ordered handler catalog                                   | Public and internal Convex exports          |
| Convex validator to JSON Schema conversion                    | Current user and organization lookup        |
| MCP tool list and call projection                             | Product access rules and usage records      |
| MCP result conversion                                         | MCP bearer-token verification               |
| Generated documentation model                                 | HTTP route registration and public URLs     |
| MCP 2026-07-28 and stateless JSON-mode MCP 2025-06-18 adapter | OAuth issuer, consent UI, and OAuth records |

This design gives both apps one contract format without making either app depend on the other app's
database model.

## Samebase baseline before this draft

Samebase already had most of the correct layers. It did not have one registration point.

The app function definition can include MCP metadata in
`apps/samebase/shared/convexFunctionPolicyTypes.ts:41`. The custom public function builders resolve
the viewer and enforce access in `apps/samebase/convex/functions.ts:145` and
`apps/samebase/convex/functions.ts:261`.

An action contract owns app arguments, MCP arguments, return validators, MCP metadata, and its
documentation. `apps/samebase/convex/vault/contracts/createRepository.ts:22` is a useful example
because its app and MCP arguments are intentionally different. The app receives an organization ID.
The MCP tool receives a GitHub owner login.

The ordered catalog is in `apps/samebase/convex/toolRuntime/actionCatalog.ts:21`. It drives the MCP
catalog and generated documentation. Before this draft, the now-deleted
`apps/samebase/convex/toolRuntime/convexSchemas.ts` converted Convex validators to JSON Schema.

The `mcp` field on a public Convex function is metadata. It does not register the function as an MCP
tool. `actionContracts` is the working registry. The product helper supplies execution reuse, and
the browser function and MCP function are still separate static Convex exports.

The real execution reuse is lower in the stack. The browser action and the MCP internal action call
the same product helper. They are two adapters over one product operation.

Adding one tool can still require five integration points:

1. Add the product contract.
2. Add it to the ordered catalog.
3. Export the browser Convex function.
4. Export the internal MCP wrapper.
5. Add the MCP name to internal function map.

The package removes the repeated catalog and schema links. The package must not hide the necessary
public and internal Convex exports because Convex discovers those exports statically.

## What to copy from Agent Native

[Agent Native](https://github.com/BuilderIO/agent-native) uses one action definition for its user
interface, HTTP, MCP, A2A, CLI, and agent surfaces. Its MCP server is built from the same action
registry. This is the useful design:

1. Define an operation once.
2. Build each external surface from one registry.
3. Make authorization part of execution, not only tool discovery.

Do not copy the full Agent Native action object. It includes framework, SQL, user interface, agent,
audit, approval, link, and deployment options. Samebase needs a smaller Convex contract.

The relevant Agent Native sources are its
[action definition](https://github.com/BuilderIO/agent-native/blob/a1869ccfe73a829c3724f0a3570ab4c0b62bb33d/packages/core/src/action.ts#L835-L1003),
[MCP request handler](https://github.com/BuilderIO/agent-native/blob/a1869ccfe73a829c3724f0a3570ab4c0b62bb33d/packages/core/src/mcp/server.ts#L233-L399),
and
[shared MCP server builder](https://github.com/BuilderIO/agent-native/blob/a1869ccfe73a829c3724f0a3570ab4c0b62bb33d/packages/core/src/mcp/build-server.ts#L1631-L1650).

## Package API

Expose two entry points in the first package version:

```text
@samebase/handlers
@samebase/handlers/mcp
```

The root entry point is usable by Convex modules and documentation scripts. It exports:

- `defineHandlerContract`
- `defineHandlerCatalog`
- `defineMcpBindings`
- `convexValidatorToJsonSchema`
- contract and catalog types
- a documentation projection type

The `/mcp` entry point is server-only. It exports one Web API `Request` to `Response` adapter based
on `@modelcontextprotocol/server`. This keeps the MCP SDK out of code that frontend bundles import.

A target app can use this shape:

```ts
export const createRepositoryContract = defineHandlerContract({
  id: "create_repository",
  access: "access_app_create",
  args: createRepositoryArgs,
  mcpArgs: createRepositoryMcpArgs,
  returns: createRepositoryResult,
  structuredContent: createRepositoryResult,
  mcp: createRepositoryMcpMetadata,
  doc: createRepositoryDoc,
});

export const catalog = defineHandlerCatalog([createRepositoryContract, getUserVaultsContract]);

export const bindings = defineMcpBindings(catalog, {
  create_repository: internal.toolRuntime.runtime.createRepositoryTool,
  get_user_vaults: internal.toolRuntime.runtime.getUserVaultsTool,
});
```

Binding keys are contract `id` values. `defineHandlerCatalog` must reject duplicate contract IDs and
duplicate MCP names. `defineMcpBindings` derives the wire-name map from this source. It must require
one binding for each MCP contract and reject extra bindings.

The binding type must keep one contract's MCP arguments, structured result, and generated Convex
function reference correlated. Each internal action receives the validated MCP input separately from
trusted app fields. Do not merge raw input and trusted fields into one object.

The package MCP adapter receives these app callbacks:

```ts
type McpHost<AuthorizationSnapshot> = {
  authorize: (request: Request) => Promise<AuthorizationSnapshot>;
  canAccess: (snapshot: AuthorizationSnapshot, contract: HandlerContract) => boolean;
};
```

`authorize` resolves the bearer token, grant scopes, current user, and current app access once for
the request. Tool registration and direct tool calls use the same pure `canAccess` check over that
snapshot. The bound action performs the final access check before it writes.

Prototype the exact mapped types, but keep this rule: raw MCP input can never set the trusted user,
organization, grant, client, or scope fields. The host creates those values after it verifies the
bearer token.

The adapter must apply access checks to both discovery and execution. A tool that is absent from
`tools/list` must also fail if a caller sends its name directly to `tools/call`.

## MCP version support

Samebase first moved to MCP `2026-07-28`, then returned to `2025-06-18` for Codex compatibility. The
current code fixes one server version in `apps/samebase/convex/mcp/protocol.ts:15` and implements
the JSON-RPC transport in `apps/samebase/convex/mcp/http.ts:798`.

Do not keep two handwritten protocol implementations. The stable
[`@modelcontextprotocol/server` version 2](https://github.com/modelcontextprotocol/typescript-sdk)
package supplies one server API for:

- MCP `2026-07-28`, including `server/discover` and request metadata.
- MCP 2025-era clients, including `2025-06-18`, that use `initialize`, `tools/list`, and
  `tools/call`.

The official guides describe
[protocol versions](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)
and
[legacy clients](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/legacy-clients.md).

Do not use the SDK's default `legacy: "stateless"` path directly in the first Samebase
implementation. That path returns a one-request SSE response. Samebase now returns JSON after the
tool operation finishes. This difference can change disconnect and execution behavior in a Convex
HTTP action.

Use the SDK's `isLegacyRequest` classifier and one shared server factory:

1. Send modern requests to `createMcpHandler(factory, { legacy: "reject" })`. Its automatic response
   mode returns JSON for Samebase tools because they do not emit MCP notifications during a call.
2. Send MCP 2025-era POST requests to `WebStandardStreamableHTTPServerTransport` with
   `sessionIdGenerator: undefined` and `enableJsonResponse: true`.
3. Return 405 for GET and DELETE.

This adapter uses the official SDK for both protocols. It keeps Samebase's JSON completion behavior
for Codex and restores MCP `2026-07-28` on the same URL. Samebase does not preserve a protocol
session between requests, so the JSON-mode stateless transport is the correct match.

The package can pass the JSON Schema that Samebase already generates through the SDK's
`fromJsonSchema` adapter. It does not need a second Zod schema for each tool.

The app must keep the current Origin check and add an explicit Host allowlist before the SDK
handler. The SDK does not authenticate the request. The app verifies the bearer token and passes the
verified authorization snapshot into the adapter.

The adapter must validate POST Content-Type before it calls `isLegacyRequest`. It must parse the
body once with one maximum size, then pass the same parsed value to the classifier and the selected
SDK handler. Each MCP 2025-era POST gets a fresh server and transport. The adapter must connect
request abort to server cleanup and close both objects after the buffered JSON response finishes.
Test the exact Accept headers that the current Codex connector sends.

Do not add protocol sessions or `subscriptions/listen` in the first package version. Convex isolate
memory is not durable, and Samebase only exposes stateless tools. Set `tools.listChanged` to false
when the package creates `McpServer`. The high-level SDK server otherwise advertises a change
notification that this stateless adapter cannot send reliably.

Only JSON-compatible Convex validators can cross the MCP boundary. Reject `v.int64()`, `v.bytes()`,
and other non-JSON validators when the catalog is built unless the package owns an explicit wire
codec. Mapping a Convex bigint validator to JSON Schema `integer` is not sufficient because MCP
input supplies a JavaScript number and Convex expects a bigint.

## OAuth boundary

Keep OAuth data and app lifecycle code in each app in the first extraction.

Samebase OAuth records contain `Id<"users">` values in `apps/samebase/convex/mcp/model.ts:39`. Token
exchange and access-token validation read the Samebase user in the same mutation. Browser handoff
also checks the grant, client, user, rate limit, and token state together. Account deletion deletes
the user-linked MCP records directly.

A Convex component cannot read parent tables. These component limits also apply to HTTP actions:
they cannot use the parent app's auth context or environment variables. The parent app must still
mount a wrapper. See the official
[component authoring guide](https://docs.convex.dev/components/authoring) and
[HTTP action guide](https://docs.convex.dev/functions/http-actions).

If Samebase and Scout later prove that their OAuth rules are the same, add
`@samebase/handlers/oauth`. It can export a table-definition factory, request validators, crypto
helpers, and transaction helpers. Each app can spread the tables into its own schema and register
thin Convex functions. This preserves same-transaction checks against app users.

Keep Samebase's current Dynamic Client Registration support while current clients need it. MCP
`2026-07-28` prefers pre-registration or Client ID Metadata Documents and marks Dynamic Client
Registration as deprecated. Do not remove a working compatibility path during the package split. The
current rules are in the official
[client registration specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration).

Use a Convex component only if both apps later accept all of these conditions:

- OAuth subjects cross the boundary as opaque strings, not app table IDs.
- User deletion and deactivation use explicit cross-component cleanup.
- OAuth and app user changes do not need one transaction.
- The value of independent component updates is greater than the migration and wrapper cost.

The current Samebase design does not meet these conditions. A component is not the correct first
move.

## Completed proof

A local SDK test used one server factory, the SDK version classifier, the modern handler, the
JSON-mode legacy transport, and one `echo` tool. Two official SDK clients called that tool:

1. A default legacy client used the 2025 initialize flow.
2. An automatic client used `server/discover` and MCP `2026-07-28`.

Both clients received the same tool list and structured result. Both tool calls returned JSON after
the tool finished. The adapter returned 405 when the legacy client tried to open a GET stream.

A second test passed a plain JSON Schema through `fromJsonSchema`. The SDK accepted valid input and
returned an MCP tool error for an invalid number where the schema required a string.

The complete adapter and JSON Schema validator bundled for browser and workerd targets without
importing a Node built-in. The MCP server entry point was about 307 KB minified and 81 KB
compressed. This is only a compatibility signal. It does not replace a real Convex deployment test.

## Scout consumer proof

On 2026-08-31, Samebase and Scout both used Convex 1.45. Scout used the local `@samebase/handlers`
package for its real product list query and product create mutation. The existing frontend callers
did not change. Scout kept its own user check and product code.

A `link:` dependency gave Scout a direct link to the Samebase package directory. Scout's complete
check and application build passed with this link. A `file:` directory dependency also passed, but
pnpm copied it into Scout's virtual store. A package change then needed another install. Use `link:`
for the local edit loop while both projects use the same Convex version.

The final package was also packed as a 4,168 byte npm archive with six expected files and no bundled
dependencies. Scout installed that archive outside the Samebase workspace, then passed all 202
tests, browser TypeScript, Node TypeScript, Convex TypeScript, lint, format, and generated-file
checks. Use this archive check once before a release. Do not use archives for normal package edits.

This proof covers the shared contract, catalog, validator conversion, and MCP tool description. It
does not yet make Scout serve an MCP HTTP route. Transport, OAuth, and tool execution binding remain
the next package phase.

This draft does not add a `samebase/handlers` repository export or an npm publishing workflow. The
package metadata points to the Samebase monorepo until that release path exists.

## Migration

Use four reviewable phases.

### Phase 1: Package the pure contract

Move the generic contract types, catalog checks, validator conversion, and documentation projection
into `packages/handlers`. Keep all Samebase action contracts and handlers in the app.

Prove the package with `create_repository` because its app and MCP argument shapes differ. Use
`packages/sidebars/scripts/check-packed-consumer.ts` as the test model so the proof installs the
real package tarball outside the monorepo.

### Phase 2: Replace the MCP transport

Add the `/mcp` adapter with the official SDK version router and JSON-mode legacy transport. Keep the
Samebase token verifier, scope checks, current-access checks, tool bindings, and HTTP routes in
Samebase.

Run the old and new adapters side by side in tests. The new adapter must pass legacy Codex traffic,
modern traffic, invalid Accept and Content-Type headers, direct hidden-tool calls, slow-call aborts,
and result schema checks before it replaces the handwritten transport.

Deploy the adapter through a real local Convex HTTP action and a cloud preview. Call both protocol
eras through the deployed `/mcp` route. Also test one slow write where the client disconnects and
retries. Record the expected idempotency rule before the transport changes.

### Phase 3: Adopt the package in Scout

Install the packed package in Scout. Add one read operation and one write operation. Prove both from
the Scout frontend and MCP. Keep Scout identity and access values in Scout.

Do not publish a stable package API until Samebase and Scout both use it. Two real consumers will
show which fields are generic and which fields only describe Samebase.

### Phase 4: Review OAuth reuse

Compare the two current OAuth implementations. If their issuer, subject, consent, scope, token, and
account lifecycle rules match, add the `/oauth` library entry point. Keep the records in each app's
main schema. Review a component only after this library form works in both apps.

## Required validation

The extraction is ready only when these checks pass:

1. Samebase frontend call for one read and one write handler.
2. Scout frontend call for one read and one write handler.
3. MCP `2026-07-28` discovery, list, and call.
4. MCP `2025-06-18` initialize, list, and call.
5. Current Codex connector against the deployed preview.
6. OAuth protected-resource and authorization-server discovery.
7. Token resource and audience rejection.
8. Hidden tool omitted from list and rejected by direct call.
9. Invalid tool input and invalid handler output.
10. Packed package install, Convex code generation, type-check, and bundle in an isolated consumer.
11. Local and cloud Convex calls through the deployed `/mcp` route.
12. Slow write disconnect and retry with the expected idempotent result.
13. User deactivation, account deletion, grant revocation, refresh rotation, and browser handoff.

The current test owners are:

- `apps/samebase/convex/functions.test.ts`
- `apps/samebase/convex/toolRuntime/actionCatalog.test.ts`
- `packages/handlers/test/handlers.test.ts`
- `apps/samebase/convex/toolRuntime/runtime.convex.test.ts`
- `apps/samebase/convex/mcp/http.convex.test.ts`
- `apps/samebase/convex/mcp/protocol.test.ts`
- `apps/samebase/convex/mcp/oauth.convex.test.ts`
- `apps/samebase/convex/mcp/grants.convex.test.ts`
- `apps/samebase/convex/userLifecycle.convex.test.ts`
- `apps/samebase/convex/accountDeletion/index.convex.test.ts`
- `apps/samebase/convex/agentBrowserHandoff.convex.test.ts`
- `apps/samebase/scripts/generate-action-docs.test.ts`

## Risks

- The current JSON Schema converter reads Convex validator metadata. Test it against the exact
  Convex versions in Samebase and Scout.
- The converter rejects Convex bigint values. Keep that rejection until an explicit wire codec
  exists.
- The SDK enforces transport headers more strictly than the handwritten Samebase server. Test the
  current Codex connector before the switch.
- Convex function references are generated app values. Keep them in one exhaustive app-owned map.
- MCP and frontend arguments can differ. Do not force one argument shape across both surfaces.
- A disconnected write can continue in Convex and then be retried by the client. Keep write
  operations idempotent and test this case before transport cutover.
- A public package API is expensive to change. Use a fixed canary version in Scout before publishing
  `0.1.0`.

## Decision

The reusable unit is a package, not a component:

1. Create `@samebase/handlers`.
2. Put the common contract, catalog, schema, documentation, and MCP adapter in it.
3. Use the official MCP SDK to serve modern and legacy clients from one catalog.
4. Keep Convex exports, product execution, authorization, HTTP registration, and OAuth state in each
   app.
5. Revisit a shared OAuth library after Samebase and Scout prove the same rules.
6. Do not use a Convex component for the first extraction.
