# Bristol TSX Project Adoption Case

## Document Control

- Status: active
- Started: 2026-07-29
- Application repository: [nicu-chiciuc/bristol_tsx](https://github.com/nicu-chiciuc/bristol_tsx)
- Application safety branch: `codex-tanstack-adoption`
- Application spike branch: `codex-tanstack-cloudflare-spike`
- Samebase research branch: `codex-project-adoption-research`
- Prior hosting record:
  [Netlify to Cloudflare Workers](../../2026-07-29-bristol-tsx-netlify-to-cloudflare-workers.md)
- Method: [Project Adoption Lab](../README.md)
- Working guidance: [portable rules](../portable-rules.md)

## Goal

Use Bristol as the first project to test a repeatable Samebase adoption process.

The application can move from Next.js and OpenNext to TanStack Start when a preview spike proves the
runtime and security boundaries. The work must also add the useful development, worktree, preview,
cleanup, and release capabilities that Bristol does not yet have.

Knowledge can move from Samebase to Bristol, from Bristol to Samebase, or into a shared asset.

## Safety Boundaries

- Keep the current Cloudflare production deployment active during tests and the framework spike.
- Do not send spike traffic to production.
- Use synthetic local or preview data for automated tests.
- Do not put personal health data, credentials, or private response bodies in evidence.
- Use the named `Nicu` Chrome profile only when an existing signed-in browser check is required.
- Do not use the `noter.guest` profile.
- Use a separate branch and pull request for every Samebase product or workflow change.

## Accepted Starting Decisions

| ID       | Decision                                                                                         | Evidence                                  |
| -------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| BRIS-001 | The adoption process is bidirectional.                                                           | Operator decision, 2026-07-29             |
| BRIS-002 | Current behavior tests come before the framework migration.                                      | Operator decision and prior auth rollback |
| BRIS-003 | TanStack Start is a candidate. A small Cloudflare preview spike is the decision gate.            | Operator decision, 2026-07-29             |
| BRIS-004 | Bristol and Samebase changes use separate worktrees, branches, commits, and pull requests.       | Operator decision, 2026-07-29             |
| BRIS-005 | The merged hosting precedent remains complete. This wider work uses a new Samebase pull request. | Operator decision, 2026-07-29             |

## Current Baseline

The current public application runs on Cloudflare Workers with Next.js and OpenNext. It has a
server-rendered private year route, a server endpoint, Convex authentication, and a tested Netlify
rollback deployment.

The source baseline is Bristol `main` commit `2948c1c8e73a05664f1472377565e1ffb79db04b`.

The first read-only inventory found:

- `npm run dev` starts Next.js and Convex in parallel. It has no setup-first path.
- `npm run check` runs lint, type check, and the production build. It runs no automated tests.
- `npm run deploy:preview` uploads a Worker version without production traffic or a public preview
  URL.
- The private `/year/[year]` route reads repository JSON on the server. The private data must not
  enter browser JavaScript assets.
- The browser Convex token is copied into an HTTP-only server session cookie. Next.js middleware
  validates that cookie before it permits private rendering.
- A new branch Convex preview is empty. Public sign-up is disabled, and there is no synthetic user
  or application-data seed.
- The repository has no normal linked-worktree setup, anonymous worktree setup, preview cleanup
  command, unit-test runner, browser-test runner, or test fixture.
- The baseline Convex application queries and mutations did not check `ctx.auth`. A caller could
  bypass route middleware and call the Convex functions directly.
- The baseline sign-out flow did not clear the persistent IndexedDB cache that contains health-query
  results.

## Capability Contract

| Capability                       | Current evidence                                   | Target                                       | Status  |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------- | ------- |
| Fresh checkout setup             | dependency install is manual                       | `npm run dev -- --once`                      | gap     |
| Normal local development         | frontend and Convex start in parallel              | setup-aware `npm run dev`                    | partial |
| One-time linked-worktree setup   | none                                               | `npm run dev -- --once`                      | gap     |
| Anonymous linked-worktree setup  | none                                               | local backend, auth user, and synthetic data | gap     |
| Framework-neutral behavior tests | HTTP, data-auth, cache, and spike tests pass       | required before migration                    | partial |
| Branch build                     | Cloudflare non-default-branch trigger              | retain                                       | exists  |
| Worker version upload            | `deploy:preview`, no production traffic            | retain                                       | exists  |
| Public pull request preview      | disabled because the backend has no safe bootstrap | safe preview or explicit no-access result    | gap     |
| Preview resource cleanup         | no project command                                 | exact branch ownership and cleanup           | gap     |
| Production promotion             | Cloudflare default-branch trigger                  | retain behind gates                          | exists  |
| Rollback                         | Netlify and prior Worker evidence                  | retain through framework cutover             | exists  |
| Observability                    | Worker logs and safe probes                        | retain or improve                            | exists  |

## Knowledge Requests

Record each question that the project worker cannot answer from Bristol and the portable rules.

| ID        | Question                                                           | Routed source  | Answer given                                                              | Project adaptation                    | Validation              |
| --------- | ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------- | ------------------------------------- | ----------------------- |
| BRIS-Q001 | Must an anonymous worktree have an isolated Convex backend?        | Samebase       | yes, a local anonymous backend                                            | use an isolated Bristol local backend | source review           |
| BRIS-Q002 | What command prepares a fresh Samebase linked worktree?            | Samebase       | `pnpm dev --once`                                                         | use `npm run dev -- --once`           | worker review           |
| BRIS-Q003 | What safe user and synthetic application data does setup create?   | Samebase       | one approved auth user, no application data                               | add a Bristol-owned synthetic seed    | source review           |
| BRIS-Q004 | How are branch build, Worker version, and Convex preview owned?    | Samebase       | separate provider resources tied to one branch                            | design pending                        | source review           |
| BRIS-Q005 | How does preview cleanup prove exact ownership and absence?        | Samebase       | exact version and Convex preview identity, with an absence-proof gap      | design pending                        | source review           |
| BRIS-Q006 | Which package-script names are stable operator actions?            | Samebase       | verb plus mode or scope                                                   | keep one setup-aware `dev` interface  | worker review           |
| BRIS-Q007 | Does TanStack Start have an official Cloudflare SSR path?          | public docs    | yes, through the Cloudflare Vite plugin                                   | official path implemented             | version upload passes   |
| BRIS-Q008 | Does Convex Auth have a supported TanStack authenticated-SSR path? | public docs    | no complete official guide                                                | keep a Bristol-owned session bridge   | real auth proof pending |
| BRIS-Q009 | What mutation pattern is safe for browser acceptance?              | Samebase       | create a unique temporary item and delete it in `finally`                 | use synthetic preview data only       | source review           |
| BRIS-Q010 | Which Samebase parts cannot be copied?                             | Samebase       | auth, vault, provider, dashboard, and cleanup implementations are private | reimplement only the proven contract  | license review          |
| BRIS-Q011 | How should Convex authorization be tested without a live backend?  | public docs    | use `convex-test` with authenticated and anonymous identities             | test every public data function       | 26 checks pass          |
| BRIS-Q012 | When can a private browser cache resume after sign-out or reload?  | Bristol        | only after a valid session clears old persistent data                     | start paused and clear before resume  | race tests pass         |
| BRIS-Q013 | How can a build prove transformed private JSON is absent?          | Bristol review | block source modules, then scan stable content fingerprints               | use two independent client gates      | deliberate import fails |

## Bidirectional Findings

| ID       | Requirement                                       | Bristol evidence                                   | Samebase or shared evidence                               | Direction           | Validation              | Status    |
| -------- | ------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | ------------------- | ----------------------- | --------- |
| BRIS-F01 | Complete generated tracked-file list              | PR #1313 added three tracked documents             | worktree setup regenerated the missing entries            | Samebase only       | generated diff          | ready     |
| BRIS-F02 | Least-privilege build secrets                     | production and preview keys are split              | Samebase writes both keys to both triggers                | Bristol to Samebase | provider record         | candidate |
| BRIS-F03 | Configuration must not promote                    | Bristol avoided the combined action                | Samebase key rotation starts production                   | Bristol to Samebase | source review           | candidate |
| BRIS-F04 | Detect the repository package manager             | Bristol uses npm and the pnpm trigger failed       | adopted builds hard-code pnpm                             | Bristol to Samebase | failed build            | candidate |
| BRIS-F05 | Support the real default branch                   | adopted repositories can use another name          | Samebase app build treats only `main` as production       | shared              | source review           | candidate |
| BRIS-F06 | Distinguish source sync from staged edits         | Bristol inventory reported `fileCount: 0`          | `fileCount` counts staged Samebase edits                  | Samebase only       | source review           | candidate |
| BRIS-F07 | Prove preview resource absence                    | a failed build can create no preview               | cleanup assumes every PR made both previews               | shared              | source review           | candidate |
| BRIS-F08 | Authorize at the data boundary                    | all 13 public data functions now require auth      | Samebase route rules cannot protect Bristol functions     | Bristol only        | 26 checks pass          | ready     |
| BRIS-F09 | Remove private browser data on sign-out           | cache starts paused and clears before resume       | portable safety rule now records the boundary             | Bristol first       | race tests pass         | ready     |
| BRIS-F10 | Keep operator scripts stable during a spike       | `spike:*` owns the candidate path                  | production callers keep their current script names        | shared              | both builds pass        | ready     |
| BRIS-F11 | Pin framework packages independently              | Start and Router use different compatible versions | Samebase also pins Start and Router to different versions | shared              | lockfile build          | candidate |
| BRIS-F12 | Verify generated deploy configuration             | the upload wrapper checks its source config        | generated redirects can otherwise select stale output     | Bristol first       | dry run passes          | ready     |
| BRIS-F13 | Put direct HTTP responses at the request boundary | request middleware returns `307` and `503`         | prior portable rules had no response-serialization rule   | Bristol first       | Workerd tests           | ready     |
| BRIS-F14 | Make private-bundle checks mandatory              | client graph block plus output fingerprints        | exact source serialization changes during bundling        | Bristol first       | deliberate import fails | ready     |

## Characterization Test Plan

Create the first Bristol implementation checkpoint as framework-neutral tests:

1. HTTP contracts for public, private, unknown, and disabled routes.
2. Session endpoint results for valid, rejected, malformed, cross-origin, unavailable-provider,
   delete, and unsupported-method requests.
3. Privacy checks that unauthenticated responses and browser assets contain no historical health
   data.
4. Domain tests for historical parsing, sort order, Bristol values, Chisinau time conversion,
   daylight-saving edges, date ranges, totals, and averages.
5. Convex tests for authentication, query ranges, deterministic order, validation, and create,
   update, and delete operations.
6. Browser tests for sign-in recovery, redirects, navigation, browser Back and Forward, dialogs,
   empty states, charts, downloads, and sign-out cache removal.
7. PWA tests for the manifest, asset access, service-worker registration, and the current
   install-only cache behavior.
8. Real local Worker route checks, production and preview dry runs, and a bundle scan for deploy
   keys and private historical data.

Keep known defects separate from parity results. A parity test must not make a privacy or
authorization defect permanent.

### First Test Slice

The first Bristol code checkpoint uses only Node's built-in test runner. It adds
`tests/characterization/server-boundary.test.mjs` and the script:

```json
"test:characterization": "node --test tests/characterization/server-boundary.test.mjs"
```

The test reads `BRISTOL_TEST_BASE_URL` and checks:

1. an unauthenticated `/year/2025?probe=one` request returns `307`
2. `Location` stays on the same origin, uses `/signin`, and preserves the exact private path and
   query in `next`
3. the redirect response has a zero-byte body
4. the sign-in destination returns `200`
5. `/api/get_raw` returns `400` with `{ "error": "Disabled" }`

Run the same test against the current Next.js app, the candidate TanStack app, the local Worker, and
the non-production branch URL.

### First Test Slice Result

[Bristol pull request #8](https://github.com/nicu-chiciuc/bristol_tsx/pull/8) contains commit
`dff1846793b8d866163a69a8bae3cad3c3a7560b`.

The characterization test passed against the current production Worker. Lint, TypeScript, format,
the Next.js build, the OpenNext build, and an independent review also passed.

Cloudflare branch build `d9f5f093-a66b-44be-9363-3f1196263f6e` completed successfully in
approximately 166 seconds. It deployed the isolated Convex preview and uploaded non-promoted Worker
version `23f9af54-f23e-4f5c-96b7-06d9ad1512ba`. It uploaded 7,374.58 KiB before compression and
1,432.85 KiB after compression. It did not change production traffic.

The build proves that the current branch trigger can run a framework-neutral test checkpoint without
production promotion. It does not yet create a safe public pull request preview.

### Data Authorization Checkpoint

Bristol commit `9407d6871b980017a4810f8fc2917c1e545f1580` makes authentication a data boundary. A
shared guard now rejects anonymous calls before each of the 13 public stool, pill, tag, and
pill-type queries and mutations can read or write application data.

The checkpoint uses the official `convex-test` harness with an Edge runtime. Its 26 checks prove
anonymous rejection and valid authenticated behavior for every public application-data function. All
fixture identities and health values are synthetic.

Cloudflare branch build `9fb274ad-7669-47a9-9d93-6f776c4ac33e` completed successfully in
approximately 206 seconds. The provider deployed an isolated Convex preview, ran the Convex tests,
built Next.js and OpenNext, and uploaded non-promoted Worker version
`f557b720-5022-4334-9070-a038f3a38d21`. It uploaded 7,389.88 KiB before compression and 1,436.77 KiB
after compression. It did not change production traffic.

This checkpoint uses a public Convex testing pattern. It does not copy a Samebase implementation.

### Private Cache Checkpoint

Bristol commit `261acd68cbb7154d4c9e9d85074ba2d12bf5bedd` makes private cache removal part of
sign-out and session startup. The storage layer starts paused, clears memory and IndexedDB before
sign-out completes, discards in-flight reads and writes after a clear, and clears again before the
first valid session can resume cache reads.

Seven focused test cases now run through the common `npm test` interface: two Convex authorization
cases and five unit cases for cache races, storage failures, reload recovery, and all sign-out
paths. TypeScript, lint with four pre-existing warnings, and the full production build pass.

Cloudflare branch build `3c5daa68-307d-4f55-b102-6020d5e58952` completed successfully in
approximately 253 seconds. It uploaded non-promoted Worker version
`a2ecd633-0716-45b0-9be2-2c114c0435df`, 7,392.79 KiB before compression and 1,437.67 KiB after
compression. Worker startup time was 41 milliseconds. It did not change production traffic.

Persistent cache now helps only within one loaded session because a full application startup clears
it. Direct cross-tab write coordination is not yet tested. This residual is part of the TanStack
preview decision, not a reason to weaken the fail-closed rule.

The Cloudflare trigger has build caching disabled. Each checkpoint installs all dependencies before
tests and the production build. The cache checkpoint installed 883 packages in approximately 177
seconds. The long install time is a workflow performance finding, separate from application
correctness.

### TanStack Start Runtime Checkpoint

[Bristol pull request #9](https://github.com/nicu-chiciuc/bristol_tsx/pull/9) contains commit
`05e21000b1d76e3f88f21073eb689590d4e3212d`. It is stacked on the safety work in pull request #8.

The additive spike uses TanStack Start, the Cloudflare Vite plugin, and the standard Workers server
entry. Its `spike:*` scripts do not change the current Next.js, OpenNext, production, or preview
operator actions.

The spike proves these boundaries:

1. `/signin` is server-rendered as a public document.
2. an unauthenticated `/year/2025` request returns an empty same-origin `307` before route rendering
3. an invalid session during an unavailable Convex check returns an empty fail-closed `503` without
   changing the cookie
4. the protected server function checks the session again
5. `/api/get_raw` keeps its exact disabled `400` response
6. PWA assets remain available and generated assets use an immutable cache header
7. the client build rejects every module under `src/data`, then an independent fingerprint scan
   finds neither the synthetic private canary nor transformed private records in the output
8. the version upload command rebuilds first, runs the bundle scan, removes Convex deploy keys,
   verifies the generated Wrangler configuration belongs to the spike, and cannot override the
   Worker name or configuration

Cloudflare build `09b7cdd0-7c6f-43e6-bec1-bd57ee1828ed` completed successfully in approximately 173
seconds. It deployed an isolated Convex preview, ran the current seven tests, passed the unchanged
Next.js and OpenNext build, and uploaded non-promoted OpenNext version
`f598c51a-0200-4778-815f-c5babb4106f0`.

The guarded spike command then uploaded TanStack version `4f3d1278-9426-4b00-9756-9becb1d15580`,
tagged `tanstack-spike-05e2100`. It is 882.00 KiB before compression and 189.82 KiB after
compression. Worker startup time is 30 milliseconds. The current OpenNext checkpoint is 7,392.81 KiB
before compression and 1,437.69 KiB after compression. This is approximately eight times smaller
before compression and seven times smaller after compression. The comparison is directional because
the spike implements only the decision boundary, not the full application.

The live deployment remains `77f95a21-bc06-42c4-ba50-1b5f0ad9966d`. Production remains on OpenNext
version `785ac1b3-71f7-4255-8af5-55be71b10d45` at 100 percent. Neither version upload changed
production traffic.

The current `npm run build:ci` production path still passes from clean generated output. One
overlapping local build saw a missing Next.js middleware manifest. Two independent isolated builds
and one clean main-thread build passed. Treat generated output directories as single-writer state
during framework spikes.

Cloudflare installed 932 packages in approximately 112 seconds for the pushed spike. The candidate
framework added 49 installed packages compared with the last safety checkpoint. Build caching is
still disabled.

An independent review found no remaining blockers for a non-promoted version upload. The full
framework migration is not approved yet. It still needs a real authenticated Convex SSR proof and an
isolated synthetic preview bootstrap.

A later Codex pull request review found that the first output scan compared only the original and
compact JSON serializations. Vite can convert JSON to JavaScript object literals, so that scan could
miss the same private records after transformation. Bristol commit
`664a87b73b07c4db2a8bd60e3fa7709b3299dae1` adds a client-only module-graph block as the primary
control and stable content fingerprints as an independent output control. A deliberate client import
of a real year module failed before output, and synthetic tests prove the fingerprint detects the
transformed object-literal shape without printing private values.

### Recommended Development Interface

Keep these public development commands:

```text
npm run dev
npm run dev -- --once
```

`npm run dev -- --once` prepares the isolated local Convex backend, environment, auth user,
generated functions, and idempotent synthetic health data, then exits.

`npm run dev` performs the same checks, waits for the backend environment, then starts Convex and
the frontend. Framework-specific frontend, backend, and seed commands remain internal implementation
details.

## TanStack Start Decision Gate

Current official guidance provides a direct Cloudflare Workers path with TanStack Start, the
Cloudflare Vite plugin, a Worker server entry, server functions, server routes, streaming, static
assets, environment bindings, and non-promoted Worker version uploads.

The main unknown is authenticated server rendering with Convex Auth. Convex documents the TanStack
Start query integration, but its Convex Auth documentation does not yet provide the complete server
session contract needed here.

The isolated preview spike must prove:

1. one public server-rendered route with hydration and client navigation
2. one protected server-rendered route with no private body before authentication
3. one protected server endpoint and direct unauthorized-call rejection
4. first-request Convex identity, authenticated query, refresh, and sign-out
5. typed Worker bindings and secrets without client-bundle leakage
6. static assets, streaming, and the current PWA assets
7. one non-promoted branch build and Worker version
8. an isolated Convex backend with a safe synthetic user and data bootstrap

The public route, unauthenticated document gate, PWA assets, local Worker runtime, typed build, and
non-promoting upload command now pass. The authenticated Convex request, refresh and sign-out flow,
direct protected server-function call, and synthetic preview bootstrap remain open.

Do not approve the full framework migration until the remaining items pass.

## Sources

- [Bristol package scripts](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/package.json#L5-L23)
- [Bristol private-route middleware](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/src/middleware.ts#L9-L78)
- [Bristol stool functions](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/convex/stools.ts#L20-L87)
- [Bristol persistent query cache](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/src/lib/convexQueryCache.ts#L29-L165)
- [Samebase worktree setup](https://github.com/samebase/samebase/blob/aee7798e5cc9cf5e5c4e729fe0d05c8301ef24a5/scripts/run-worktree-dev.ts#L199-L399)
- [Samebase Cloudflare build modes](https://github.com/samebase/samebase/blob/aee7798e5cc9cf5e5c4e729fe0d05c8301ef24a5/apps/samebase/scripts/build-cloudflare.ts#L94-L165)
- [Samebase preview cleanup](https://github.com/samebase/samebase/blob/aee7798e5cc9cf5e5c4e729fe0d05c8301ef24a5/docs/samebase-pr-preview-cleanup.md#L20-L166)
- [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [TanStack Start migration from Next.js](https://tanstack.com/start/latest/docs/framework/react/migrate-from-next-js)
- [Convex TanStack Start guide](https://docs.convex.dev/client/tanstack/tanstack-start/)
- [Convex Auth documentation](https://docs.convex.dev/auth/convex-auth)
- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)

## Checkpoints

1. Process charter, capability inventory, and test plan: complete
2. Framework-neutral characterization tests: in progress, HTTP, authorization, and cache slices
   complete
3. TanStack Start and Cloudflare preview spike: in progress, anonymous runtime and version upload
   pass
4. Runtime migration, if the spike passes: pending
5. Worktree, preview, cleanup, and release workflows: pending
6. Bidirectional findings and portable outputs: in progress
