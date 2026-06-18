# 086 Route Search Schema Naming And Accepted Keys Plan

## Document Control

- Status: Proposed; slice 1 implemented in the same PR
- Owner: Noter frontend/app shell
- Last updated: 2026-06-12
- Depends on:
  - `apps/noter/src/lib/routeSearchParamMetadata.ts`
  - `apps/noter/src/lib/rootRouteSearch.ts`
  - `apps/noter/src/lib/logoRouteSearch.ts`
  - `apps/noter/src/lib/routeAddress.ts`
  - `apps/noter/src/routes/*`
  - `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`
  - `specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md`
  - `specs/109_ROUTE_URL_EDITOR_REBUILD_REQUIREMENTS_SPEC.md`
  - `specs/082_TANSTACK_ROUTER_CLEANUP_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`

## Summary

Route search definitions are schemas, not incidental helper objects. They define the query keys a
route accepts, how values parse, which keys are presence flags, and what metadata the route URL
editor can use. This plan makes each route's schema the source of truth for one more output: the set
of query keys that may appear on a destination path at all.

The user-visible bug this fixes first: editing the route URL from `/machines?machineId=x` to `/home`
kept `?machineId=x` on `/home` even though no `/home` surface reads it. Query params now need to
become more durable objects, because the access-model rollout (`rfcs/085`) will attach permission
metadata to each of them.

## Vocabulary: accepted keys, not availability

The repo already uses "availability" for deployment-environment gating
(`staticData.availableEnvironments`, `canAccessNoterRouteMatchesAvailability` in
`apps/noter/src/lib/routeAvailability.ts`), and the access model adds `access_*` requirement keys
next. Following `rfcs/085`'s disjoint-vocabulary principle, this plan names its concept **accepted
search keys**:

- A query key is **accepted** on a path when it is root-owned (the root route matches every path) or
  belongs to the schema of the most specific route template matching that path.
- Acceptance is **structural and role-independent**: it reads schema membership only, never
  `permission`/`canAccess`. URLs resolve identically for every viewer; permissions gate page access
  and editor exposure, never URL shape.
- Editor **suggestions remain a derived exposure view**. A hidden or manual param is accepted even
  though the editor never suggests it (`suggestion` metadata controls exposure only).

## Naming Contract

Route search schema constants use an uppercase greppable stem:

```ts
const RouteSearchSchema_machines = defineRouteSearchParams({
  // /machines-owned params
});
```

Rules:

1. The constant is `RouteSearchSchema_<owner>`; the suffix names the route, route family, or shared
   cross-cutting owner (`RouteSearchSchema_appThemeColor`) of the params.
2. No leading `v` (reserved for Convex validators) and no `*FieldSchema` names.
3. Schema constants live in `.ts` lib modules. Exported capitalized constants in `.tsx` files match
   eslint-plugin-react-refresh's component regex and silently disable its only-export-components
   protection; the one module-private exception is `routes/visual-fixture.tsx`.
4. When the contract graduates from this RFC, it gets one naming bullet in
   `docs/code-guardrails.md`.

Slice 1 renamed all twelve existing schema constants (they previously used camelCase
`<owner>RouteSearchSchema` and `*FieldSchema` forms).

## Accepted Keys Contract

Every route schema derives one route search `staticData` fragment:

```ts
export const MACHINES_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  machinesRouteSearchParamMetadata,
);
```

and declares them on the route:

```ts
staticData: {
  ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  ...MACHINES_ROUTE_SEARCH_STATIC_DATA,
},
```

A route without `acceptedSearchKeys` accepts only root-owned keys. The route URL editor's route
update filter (`readRouteAddressRouteUpdateDraft`) drops draft query tokens whose key is neither
root-owned nor accepted by the destination's most specific matching route template.

Acceptance is enforced at two points:

1. **Editor route updates**: `readRouteAddressRouteUpdateDraft` filters draft tokens, so typed or
   suggestion-selected destinations never carry non-accepted keys. (Plain `Link`/`navigate` calls
   without a `search` prop already drop non-retained keys via the root retain middleware plus
   TanStack's final search middleware; the editor's raw `history.push` path was the `machineId`
   leak. Cross-route `search: true` or spread-prev navigations would be the remaining carriers; do
   not introduce them.)
2. **Load-time canonical redirect**: the existing root `beforeLoad` redirect (the same mechanism
   that canonicalizes `?reset` and conflicting `dark&light`) now also drops raw query keys no
   matched route accepts, so a directly loaded deep link like `/logo?isoStyle=shaded-edge` lands on
   `/logo` with a `replace` redirect. Implementation note: TanStack's `beforeLoad` `search` argument
   merges raw keys with validated results, so the redirect derives the canonical root search from
   `location.searchStr` itself — spreading the contaminated argument re-adds dropped keys and loops
   the redirect.

The editor's canonical-address prediction calls the same redirect function with the same
accepted-keys lookup, keeping the editor state machine in sync with what TanStack reports.

History rule: an entry that is already canonical never redirects, so Back/Forward restore canonical
entries unchanged; a pre-existing dirty entry canonicalizes on traversal exactly like the shipped
`reset`/theme-conflict redirects.

## User Stories

1. **Machines to home (implemented).** On `/machines?machineId=x&threadId=y`, editing the path to
   `/home` navigates to `/home` with both keys dropped. Typing `/machines?machineId=x` from `/home`
   keeps the keys, because `/machines` accepts them.
2. **Fun params are app-wide.** The interactive logo ships on `/` and `/home`, not only `/logo`, so
   its appearance controls (theme colors, `dark`/`light`, `zoom`, `depth`, ...) are app-level state:
   set them anywhere, keep them everywhere, including across `/machines` and `/pricing`. Slice 2
   formalizes this by moving them into the root schema, which is what "root-owned" already means
   structurally.
3. **Renderer params are route-owned (implemented).** `isoSide`/`isoStyle` configure the `/logo/iso`
   renderer and live in `RouteSearchSchema_logoIso` (the shared logo schema plus the iso params);
   `/logo?isoStyle=shaded-edge` redirects to `/logo` on load, and editor drafts drop the iso keys on
   every non-iso destination.
4. **Back restores what you saw.** After any pruned navigation, Back returns to the previous history
   entry with its original query string intact.
5. **Shared URLs are viewer-independent.** A URL pasted to another user resolves to the same query
   keys regardless of role; what the page then shows them is the access model's job.
6. **Auth flows survive deep paths.** Root-owned auth params (`auth`, `auth-return`, `sign-in`,
   `create-account`) are accepted on every path, so inline sign-in on `/oauth/mcp/consent` keeps
   round-tripping its markers.

## Implementation Slices

**Slice 1 (this PR, done).** Rename the twelve schema constants to `RouteSearchSchema_*`; add
`readRouteSearchAcceptedKeys`; declare `staticData.acceptedSearchKeys` on every schema-bearing route
(machines, machine-connect, pricing, mcp-consent, vault-file, codex research x2, landing-preview,
all eight logo routes, visual-fixture); make the editor's route update filter acceptance-based; add
the load-time canonical redirect to root `beforeLoad`; split `isoSide`/`isoStyle` into
`RouteSearchSchema_logoIso` ahead of the full logo split (the first route-owned params). Unit
coverage in `routeAddress.test.ts`, `rootRouteSearch.test.ts`, `logoRouteSearch.test.ts`, and
load-redirect coverage in `appRouter.test.tsx`.

**Slice 2 — root ownership transfer and logo split.** Move the app-wide logo params into the root
schema as the single declaration of "accepted everywhere + retained across navigation"; derive the
retain middleware's key list from the root schema, deleting the hand-maintained
`RETAINED_ROOT_SEARCH_KEYS` spread of all logo keys. Split `RouteSearchSchema_logo` into per-route
schemas covering all eight logo routes (including `/logo/single-cube`, `/logo/raster-seams`, and the
transition labs, which today declare suggestions without any `validateSearch`). This requires the
key-by-key disposition in Open Questions, splits
`LogoRouteSearch`/`buildLogoRouteSearch`/`replaceRootLogoRouteSearch`, and rewrites the
`appRouter.test.tsx` retention tests to the new contract.

**Slice 3 — param groups.** Add a `group` metadata field (first value: `"fun"`) and ship it together
with its consumer: the route URL editor renders grouped suggestion sections separating playful
controls from functional globals like `prod-ui` and `reset`. `group` is presentation semantics; it
never affects acceptance.

**Slice 4 — presence-flag derivation.** Derive `ROUTE_SEARCH_PRESENCE_FLAG_KEYS` from the union of
schema presence keys and amend `specs/090` (its hand-enumerated list is already stale: `left`,
`right`, and `stripeLink` are missing).

Sequencing with the access model: slice 1's mechanical renames land before `rfcs/085` Phase 2
renames `permission` to `access` across the same nine search modules; the slice-2 logo split lands
after Phase 2, and shared-schema params then carry the weakest access key of any route that composes
them while route-owned params inherit their owning route's key.

## Validation

Implemented in `routeAddress.test.ts`:

1. `/machines?machineId=...` draft to `/home` drops the machine keys
2. drafts to `/machines` keep `machineId`/`threadId`
3. root-owned params (`prod-ui`, `dark`) survive on schema-less destinations
4. hidden root-owned params (`devtools`) survive on every destination
5. keys no schema accepts are dropped everywhere

Slice 2 adds: per-key disposition coverage for the logo split, retention-middleware derivation tests
replacing the current `appRouter.test.tsx` retention assertions, and Back/Forward coverage proving
pruning never rewrites restored entries.

## Resolved Decisions

1. **Acceptance rides the existing draft/canonical split; the editor state machine does not
   change.** `draftRouteAddress` is never rewritten while typing: during a path transit such as
   `/logo/iso?isoSide=120` to `/logo` and back, `isoSide` stays visible in the draft text and
   reapplies as soon as the path again names a route that accepts it. Only the applied route
   (`expectedRouteAddress` while focused, the TanStack-rendered `committedRouteAddress` after blur)
   excludes non-accepted keys — the same boundary where canonicalization already reorders query
   params after blur. Fitting new behavior into this existing mental model, instead of adding editor
   states or events, is the standing design rule for this plan.

## Open Questions

1. **Per-key disposition for slice 2:** proposed split — app-wide fun (root-owned): `background`,
   `border`, `dark`, `light`, `primary`, `secondary`, `top`, `zoom`, `depth`, `dist`, `gridSize`,
   `dev`, `elev`, `rot`, `axis`, `freeView`, `leftFace`, `vox`; route-owned: `isoSide`, `isoStyle`
   (`/logo/iso` family), raster seam controls. Confirm or adjust.
2. **Group vocabulary:** is `"fun"` the only group, or also `"debug"` (`devtools`, `dev`) and
   `"auth"` (`auth`, `auth-return`, `sign-in`)?

## Non-Goals

This plan does not change the shipped key-only query string format from `specs/090`.

This plan does not require a single giant route-search schema file; schemas stay near the route or
family that owns them as long as they follow the naming contract and expose the same derived
metadata.

This plan does not make editor suggestions the acceptance source of truth, and it does not make
acceptance viewer-dependent.
