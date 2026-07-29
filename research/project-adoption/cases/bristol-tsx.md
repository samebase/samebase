# Bristol TSX Project Adoption Case

## Document Control

- Status: active
- Started: 2026-07-29
- Application repository: [nicu-chiciuc/bristol_tsx](https://github.com/nicu-chiciuc/bristol_tsx)
- Application branch: `codex-tanstack-adoption`
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
- Convex application queries and mutations do not check `ctx.auth`. A caller can bypass route
  middleware and call the Convex functions directly.
- Sign-out does not clear the persistent IndexedDB cache that contains health-query results.

## Capability Contract

| Capability                       | Current evidence                                   | Target                                       | Status  |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------- | ------- |
| Fresh checkout setup             | dependency install is manual                       | `npm run dev -- --once`                      | gap     |
| Normal local development         | frontend and Convex start in parallel              | setup-aware `npm run dev`                    | partial |
| One-time linked-worktree setup   | none                                               | `npm run dev -- --once`                      | gap     |
| Anonymous linked-worktree setup  | none                                               | local backend, auth user, and synthetic data | gap     |
| Framework-neutral behavior tests | first HTTP boundary test passes                    | required before migration                    | partial |
| Branch build                     | Cloudflare non-default-branch trigger              | retain                                       | exists  |
| Worker version upload            | `deploy:preview`, no production traffic            | retain                                       | exists  |
| Public pull request preview      | disabled because the backend has no safe bootstrap | safe preview or explicit no-access result    | gap     |
| Preview resource cleanup         | no project command                                 | exact branch ownership and cleanup           | gap     |
| Production promotion             | Cloudflare default-branch trigger                  | retain behind gates                          | exists  |
| Rollback                         | Netlify and prior Worker evidence                  | retain through framework cutover             | exists  |
| Observability                    | Worker logs and safe probes                        | retain or improve                            | exists  |

## Knowledge Requests

Record each question that the project worker cannot answer from Bristol and the portable rules.

| ID        | Question                                                           | Routed source | Answer given                                                              | Project adaptation                    | Validation             |
| --------- | ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------- | ------------------------------------- | ---------------------- |
| BRIS-Q001 | Must an anonymous worktree have an isolated Convex backend?        | Samebase      | yes, a local anonymous backend                                            | use an isolated Bristol local backend | source review          |
| BRIS-Q002 | What command prepares a fresh Samebase linked worktree?            | Samebase      | `pnpm dev --once`                                                         | use `npm run dev -- --once`           | worker review          |
| BRIS-Q003 | What safe user and synthetic application data does setup create?   | Samebase      | one approved auth user, no application data                               | add a Bristol-owned synthetic seed    | source review          |
| BRIS-Q004 | How are branch build, Worker version, and Convex preview owned?    | Samebase      | separate provider resources tied to one branch                            | design pending                        | source review          |
| BRIS-Q005 | How does preview cleanup prove exact ownership and absence?        | Samebase      | exact version and Convex preview identity, with an absence-proof gap      | design pending                        | source review          |
| BRIS-Q006 | Which package-script names are stable operator actions?            | Samebase      | verb plus mode or scope                                                   | keep one setup-aware `dev` interface  | worker review          |
| BRIS-Q007 | Does TanStack Start have an official Cloudflare SSR path?          | public docs   | yes, through the Cloudflare Vite plugin                                   | spike pending                         | official-source review |
| BRIS-Q008 | Does Convex Auth have a supported TanStack authenticated-SSR path? | public docs   | no complete official guide                                                | spike pending                         | official-source review |
| BRIS-Q009 | What mutation pattern is safe for browser acceptance?              | Samebase      | create a unique temporary item and delete it in `finally`                 | use synthetic preview data only       | source review          |
| BRIS-Q010 | Which Samebase parts cannot be copied?                             | Samebase      | auth, vault, provider, dashboard, and cleanup implementations are private | reimplement only the proven contract  | license review         |

## Bidirectional Findings

| ID       | Requirement                               | Bristol evidence                             | Samebase evidence                                     | Direction           | Validation      | Status    |
| -------- | ----------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | ------------------- | --------------- | --------- |
| BRIS-F01 | Complete generated tracked-file list      | PR #1313 added three tracked documents       | worktree setup regenerated the missing entries        | Samebase only       | generated diff  | ready     |
| BRIS-F02 | Least-privilege build secrets             | production and preview keys are split        | Samebase writes both keys to both triggers            | Bristol to Samebase | provider record | candidate |
| BRIS-F03 | Configuration must not promote            | Bristol avoided the combined action          | Samebase key rotation starts production               | Bristol to Samebase | source review   | candidate |
| BRIS-F04 | Detect the repository package manager     | Bristol uses npm and the pnpm trigger failed | adopted builds hard-code pnpm                         | Bristol to Samebase | failed build    | candidate |
| BRIS-F05 | Support the real default branch           | adopted repositories can use another name    | Samebase app build treats only `main` as production   | shared              | source review   | candidate |
| BRIS-F06 | Distinguish source sync from staged edits | Bristol inventory reported `fileCount: 0`    | `fileCount` counts staged Samebase edits              | Samebase only       | source review   | candidate |
| BRIS-F07 | Prove preview resource absence            | a failed build can create no preview         | cleanup assumes every PR made both previews           | shared              | source review   | candidate |
| BRIS-F08 | Authorize at the data boundary            | direct Convex functions do not check auth    | Samebase route rules cannot protect Bristol functions | Bristol only        | tests pending   | required  |
| BRIS-F09 | Remove private browser data on sign-out   | IndexedDB keeps health-query results         | portable safety rule now records the boundary         | Bristol first       | tests pending   | required  |

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

Do not approve the full framework migration until this spike passes.

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
2. Framework-neutral characterization tests: in progress, first HTTP boundary slice complete
3. TanStack Start and Cloudflare preview spike: pending
4. Runtime migration, if the spike passes: pending
5. Worktree, preview, cleanup, and release workflows: pending
6. Bidirectional findings and portable outputs: in progress
