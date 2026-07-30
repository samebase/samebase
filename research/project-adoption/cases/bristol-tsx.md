# Bristol TSX Project Adoption Case

## Document Control

- Status: branch validation complete, production cutover pending
- Started: 2026-07-29
- Application repository: [nicu-chiciuc/bristol_tsx](https://github.com/nicu-chiciuc/bristol_tsx)
- Application safety branch: `codex-tanstack-adoption`
- Application spike branch: `codex-tanstack-cloudflare-spike`
- Application migration branch: `codex-tanstack-migration`
- Application spike pull request:
  [pull request 9](https://github.com/nicu-chiciuc/bristol_tsx/pull/9)
- Application migration pull request:
  [pull request 10](https://github.com/nicu-chiciuc/bristol_tsx/pull/10)
- Application runtime extraction pull request:
  [pull request 11](https://github.com/nicu-chiciuc/bristol_tsx/pull/11)
- Application linked-worktree pull request:
  [pull request 12](https://github.com/nicu-chiciuc/bristol_tsx/pull/12)
- Application preview-inspection pull request:
  [pull request 13](https://github.com/nicu-chiciuc/bristol_tsx/pull/13)
- Application preview-ownership pull request:
  [pull request 14](https://github.com/nicu-chiciuc/bristol_tsx/pull/14)
- Application production-promotion pull request:
  [pull request 15](https://github.com/nicu-chiciuc/bristol_tsx/pull/15)
- Samebase research branch: `codex-project-adoption-research`
- Prior hosting record:
  [Netlify to Cloudflare Workers](../../2026-07-29-bristol-tsx-netlify-to-cloudflare-workers.md)
- Method: [Project Adoption Lab](../README.md)
- Working guidance: [portable rules](../portable-rules.md)

## Goal

Use Bristol as the first project to test a repeatable Samebase adoption process.

The application migration branch now uses TanStack Start instead of Next.js and OpenNext. The branch
passed its runtime, security, route, and public-preview gates. Production cutover still needs
operator approval.

The work also identifies useful development, worktree, preview, cleanup, and release capabilities.
Bristol now has normal linked-worktree development and isolated linked-worktree acceptance. Preview
inspection now verifies an exact source-to-Worker-to-backend join and reports the remaining live
inventory unknown. Preview resource cleanup remains a separate gap.

Knowledge can move from Samebase to Bristol, from Bristol to Samebase, or into a shared asset.

## Safety Boundaries

- Keep the current Cloudflare production deployment active during tests and the framework spike.
- Do not send spike traffic to production.
- Use synthetic local or preview data for automated tests.
- Do not put personal health data, credentials, or private response bodies in evidence.
- Use the main Chrome profile for `nicuchiciuc@gmail.com` when a browser check is required.
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

## Starting Baseline

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
- The baseline pinned Node 22.16, had no package `"type": "module"`, and used `.mjs` for handwritten
  Node automation. Its application TypeScript configuration did not include that automation.

## Capability Contract

| Capability                       | Branch evidence                                                 | Target                                 | Status                        |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------- | ----------------------------- |
| Fresh checkout setup             | `dev` installs missing or stale dependencies                    | repeatable setup-aware command         | complete                      |
| Normal local development         | `dev` starts Vite and normal Convex development                 | retain                                 | complete                      |
| Repeatable linked-worktree setup | `setup:worktree` owns local state and one synthetic account     | isolated setup with explicit ownership | complete                      |
| Anonymous linked-worktree setup  | `dev` selects an owned anonymous loopback backend               | local backend and auth user            | complete                      |
| Linked-worktree acceptance       | two real setup, browser, service, and cleanup cycles            | isolated committed-head proof          | complete                      |
| Framework-neutral behavior tests | HTTP, data-auth, cache, Worker, and browser suites pass         | required before migration              | complete                      |
| Authored Node source model       | Node 24, ESM, `.ts`, source guard, and strict Node type check   | Samebase-aligned TypeScript            | correction in progress        |
| Branch build                     | Cloudflare non-default-branch trigger                           | retain                                 | complete                      |
| Worker version upload            | `deploy:preview` uploads without production traffic             | retain                                 | complete                      |
| Public pull request preview      | stable branch URL with a fresh synthetic Convex backend         | safe public preview                    | complete                      |
| Preview authentication           | preview-only keys, profile, account, seed, and sign-in contract | retain                                 | complete                      |
| Exact preview ownership          | strict version annotation joins commit and Convex URL           | current source-to-backend identity     | complete                      |
| Read-only preview inspection     | source, account, build, version, URL, and active deployment     | fail-closed bounded evidence           | implemented, partial evidence |
| Preview resource cleanup         | no project command                                              | exact branch ownership and cleanup     | gap                           |
| Production promotion             | one draft PR from the final reviewed stack head                 | one default-branch cutover             | draft gate open, not run      |
| Rollback                         | Netlify and prior Worker evidence                               | retain through framework cutover       | complete                      |
| Observability                    | build, version, route, and browser evidence; no preview logs    | state the preview limit                | partial                       |

## Knowledge Requests

Record each question that the project worker cannot answer from Bristol and the portable rules.

| ID        | Question                                                           | Routed source   | Answer given                                                               | Project adaptation                       | Validation               |
| --------- | ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------- | ---------------------------------------- | ------------------------ |
| BRIS-Q001 | Must an anonymous worktree have an isolated Convex backend?        | Samebase        | yes, a local anonymous backend                                             | use an isolated Bristol local backend    | source review            |
| BRIS-Q002 | What command prepares a fresh Samebase linked worktree?            | Samebase        | `pnpm dev --once`                                                          | add repeatable `setup:worktree`          | two-cycle acceptance     |
| BRIS-Q003 | What safe user and synthetic application data does setup create?   | Samebase        | one approved auth user, no application data                                | seed only isolated tests and previews    | browser acceptance       |
| BRIS-Q004 | How are branch build, Worker version, and Convex preview owned?    | Samebase        | separate provider resources tied to one branch                             | track all three identities               | final preview passes     |
| BRIS-Q005 | How does preview cleanup prove exact ownership and absence?        | Samebase        | complete provider reads, retained plan, re-read, delete, and absence proof | keep credentials and cleanup in Samebase | two-agent design review  |
| BRIS-Q006 | Which package-script names are stable operator actions?            | Samebase        | verb plus mode or scope                                                    | keep only distinct Bristol actions       | unused aliases removed   |
| BRIS-Q007 | Does TanStack Start have an official Cloudflare SSR path?          | public docs     | yes, through the Cloudflare Vite plugin                                    | official path implemented                | version upload passes    |
| BRIS-Q008 | Does Convex Auth have a supported TanStack authenticated-SSR path? | public docs     | no complete official guide                                                 | keep a Bristol-owned session bridge      | local auth proof passes  |
| BRIS-Q009 | What mutation pattern is safe for browser acceptance?              | Samebase        | create a unique temporary item and delete it in `finally`                  | use synthetic preview data only          | preview write removed    |
| BRIS-Q010 | Which Samebase parts cannot be copied?                             | Samebase        | auth, vault, provider, dashboard, and cleanup implementations are private  | reimplement only the proven contract     | license review           |
| BRIS-Q011 | How should Convex authorization be tested without a live backend?  | public docs     | use `convex-test` with authenticated and anonymous identities              | test every public data function          | 26 checks pass           |
| BRIS-Q012 | When can a private browser cache resume after sign-out or reload?  | Bristol         | only after a valid session clears old persistent data                      | start paused and clear before resume     | race tests pass          |
| BRIS-Q013 | How can a build prove transformed private JSON is absent?          | Bristol review  | block source modules, then scan stable content fingerprints                | use two independent client gates         | deliberate import fails  |
| BRIS-Q014 | How can local Workerd reach a loopback Convex backend?             | Samebase        | use a parent-owned temporary tunnel with synthetic data only               | spike used tunnel; final uses loopback   | both runtime paths pass  |
| BRIS-Q015 | Which processes must an isolated runner stop?                      | Bristol test    | active setup and build groups plus all long-running service groups         | track every detached child group         | forced interrupts pass   |
| BRIS-Q016 | What must identify a manual provider build?                        | Bristol test    | exact branch and full commit SHA                                           | reject missing or stale metadata         | guard tests pass         |
| BRIS-Q017 | Which settings make a Worker preview public?                       | provider read   | repository URL intent and provider `previews_enabled` are separate         | reconcile and verify both                | public route passes      |
| BRIS-Q018 | Does provider readiness prove a completed build?                   | Samebase        | no, read build, version, URL, backend, and active deployment separately    | use provider-native terminal reads       | final build observed     |
| BRIS-Q019 | How can a browser tool handle credentials safely?                  | Bristol test    | select the account first and never capture filled credential fields        | transfer without logs, then clear        | values rotated           |
| BRIS-Q020 | What does absence from a bounded provider list prove?              | Bristol review  | nothing beyond that response window                                        | report unverified, not absent            | observer returns partial |
| BRIS-Q021 | What environment may a read-only provider child inherit?           | Bristol review  | a small OS allowlist and only its required authentication source           | strip endpoint and output overrides      | injected overrides pass  |
| BRIS-Q022 | How does an observer bind Cloudflare evidence to Bristol?          | Bristol live    | validate the main identity first and force the exact account ID            | reject other identities and URLs         | self-inspection passes   |
| BRIS-Q023 | Can a Convex preview deploy key list all preview deployments?      | public docs     | no, management inventory uses a separate bearer token                      | keep live inventory unavailable          | least-privilege review   |
| BRIS-Q024 | How can a Worker version identify its source and backend?          | Bristol live    | strict versioned annotation with full commit and public Convex URL         | bind only new preview uploads            | exact live join passes   |
| BRIS-Q025 | Can Samebase prove that the shown backend matches the PR commit?   | Samebase UI     | not yet; UI warns and MCP does not expose the live PR resource view        | keep the inspector result partial        | UI and MCP comparison    |
| BRIS-Q026 | Which Convex deployment hostname shapes are valid?                 | public docs     | deployment name, optional `eu-west-1`, then `convex.cloud`                 | validate the full hostname first         | live regional URL passes |
| BRIS-Q027 | How should a stacked migration reach a production default branch?  | Bristol release | one promotion PR from the final reviewed head                              | keep slices as evidence; merge once      | draft PR and live reads  |
| BRIS-Q028 | Which backend auth settings must the cutover gate read?            | Bristol review  | exact production profile and non-debug log policy                          | require `production` and `ERROR`         | live production read     |
| BRIS-Q029 | Which source model must the adopted Node automation use?           | Samebase        | Node 24, ESM package semantics, and directly executed `.ts` files          | convert all handwritten Node files       | correction in progress   |

## Bidirectional Findings

| ID       | Requirement                                       | Bristol evidence                                         | Samebase or shared evidence                                 | Direction           | Validation               | Status    |
| -------- | ------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- | ------------------- | ------------------------ | --------- |
| BRIS-F01 | Complete generated tracked-file list              | PR #1313 added three tracked documents                   | worktree setup regenerated the missing entries              | Samebase only       | generated diff           | ready     |
| BRIS-F02 | Least-privilege build secrets                     | production and preview keys are split                    | Samebase writes both keys to both triggers                  | Bristol to Samebase | provider record          | candidate |
| BRIS-F03 | Configuration must not promote                    | Bristol avoided the combined action                      | Samebase key rotation starts production                     | Bristol to Samebase | source review            | candidate |
| BRIS-F04 | Detect the repository package manager             | Bristol uses npm and the pnpm trigger failed             | adopted builds hard-code pnpm                               | Bristol to Samebase | failed build             | candidate |
| BRIS-F05 | Support the real default branch                   | adopted repositories can use another name                | Samebase app build treats only `main` as production         | shared              | source review            | candidate |
| BRIS-F06 | Distinguish source sync from staged edits         | Bristol inventory reported `fileCount: 0`                | `fileCount` counts staged Samebase edits                    | Samebase only       | source review            | candidate |
| BRIS-F07 | Prove preview resource absence                    | a failed build can create no preview                     | cleanup assumes every PR made both previews                 | shared              | source review            | candidate |
| BRIS-F08 | Authorize at the data boundary                    | all 13 public data functions now require auth            | Samebase route rules cannot protect Bristol functions       | Bristol only        | 26 checks pass           | ready     |
| BRIS-F09 | Remove private browser data on sign-out           | cache starts paused and clears before resume             | portable safety rule now records the boundary               | Bristol first       | race tests pass          | ready     |
| BRIS-F10 | Scope and later remove framework spike scripts    | `spike:*` first owned the candidate path                 | production callers kept their current script names          | shared              | removed after gate       | ready     |
| BRIS-F11 | Pin framework packages independently              | Start and Router use different compatible versions       | Samebase also pins Start and Router to different versions   | shared              | lockfile build           | candidate |
| BRIS-F12 | Verify generated deploy configuration             | the upload wrapper checks its source config              | generated redirects can otherwise select stale output       | Bristol first       | dry run passes           | ready     |
| BRIS-F13 | Put direct HTTP responses at the request boundary | request middleware returns `307` and `503`               | prior portable rules had no response-serialization rule     | Bristol first       | Workerd tests            | ready     |
| BRIS-F14 | Make private-bundle checks mandatory              | client graph block plus output fingerprints              | exact source serialization changes during bundling          | Bristol first       | deliberate import fails  | ready     |
| BRIS-F15 | Separate invalid auth from backend failure        | `401` clears; `503` keeps the session cookie             | outage must not become destructive sign-out                 | Bristol first       | authenticated runner     | ready     |
| BRIS-F16 | Test interrupt cleanup                            | first forced stop found a remaining site listener        | normal completion did not expose this lifecycle defect      | Bristol to Samebase | two forced stops pass    | candidate |
| BRIS-F17 | Bind version upload to its backend URL            | upload checks the compiled `*.convex.cloud` URL          | generated config ownership alone cannot prove runtime auth  | Bristol first       | guard tests pass         | ready     |
| BRIS-F18 | Probe through the real network consumer           | host DNS failed while local Workerd reached tunnel       | host and Worker runtimes can use different resolvers        | shared              | authenticated request    | ready     |
| BRIS-F19 | Reconcile all preview URL controls                | `preview_urls` did not change `previews_enabled`         | existing Workers keep a separate provider switch            | shared              | public route passes      | ready     |
| BRIS-F20 | Require branch and commit for a manual build      | a branch-only build failed the stale-head guard          | a branch name alone does not identify source                | shared              | guard tests pass         | ready     |
| BRIS-F21 | Separate readiness from terminal provider state   | inventory was ready before the final build ended         | provider-native reads proved build and deployment state     | Samebase only       | provider reads           | candidate |
| BRIS-F22 | Show complete preview backend readiness           | auth needed six defaults, a seed, URL, and version       | no one view showed the complete public-preview contract     | Samebase only       | browser acceptance       | candidate |
| BRIS-F23 | Remove unused copied script names                 | three aliases and all spike scripts had no consumer      | shared names without shared behavior create false knowledge | Bristol first       | caller scan              | ready     |
| BRIS-F24 | Keep credentials out of DOM captures              | one filled-field snapshot exposed a preview value        | account and signing keys needed immediate rotation          | shared              | rotated preview passes   | ready     |
| BRIS-F25 | Prove credential entry replaces old text          | virtual paste appended when a shortcut did not clear     | wrong combined input looked like a valid auth rejection     | shared              | exact-length check       | ready     |
| BRIS-F26 | Sanitize before all linked setup work             | npm install, Git hooks, setup, and services are clean    | service-only cleanup leaves earlier child processes exposed | Bristol to Samebase | injected-provider proof  | candidate |
| BRIS-F27 | Serialize first-run setup                         | a Git compare-and-swap lease owns the full setup         | marker-based setup has no equivalent concurrent-run lease   | Bristol to Samebase | lease contract checks    | candidate |
| BRIS-F28 | Wait for hydration before browser input           | visible SSR controls did not yet have React handlers     | visibility alone is not an interaction-readiness proof      | shared              | two-cycle browser proof  | ready     |
| BRIS-F29 | Redact encoded credentials                        | one failure URL-encoded the synthetic email              | raw-value redaction alone missed the derived value          | shared              | failure-path proof       | ready     |
| BRIS-F30 | Preserve unresolved cleanup evidence              | cleanup checks the lease and Git registration            | directory deletion alone can leave or hide owned state      | Bristol to Samebase | exact absence proof      | candidate |
| BRIS-F31 | Classify only the expected missing-account result | pending setup accepts exact `InvalidAccountId`           | provider error text and recovery state must stay coupled    | Bristol only        | recovery contract check  | ready     |
| BRIS-F32 | State the supported process-cleanup platforms     | linked runtime fails closed on Windows                   | skipped tests cannot prove a platform guarantee             | shared              | platform gate check      | ready     |
| BRIS-F33 | Make a shared proxy target deterministic          | Bristol exposed the non-loopback acceptance need         | Samebase neither sets nor clears its proxy-target variable  | Bristol to Samebase | source review            | candidate |
| BRIS-F34 | Enforce the final credential file mode            | setup corrects umask and rereads mode `0600`             | a requested creation mode is not a final-mode guarantee     | shared              | restrictive-umask check  | ready     |
| BRIS-F35 | Report bounded-list misses as unknown             | ten recent versions cannot prove absence                 | cleanup needs full Cloudflare pagination                    | shared              | live partial report      | ready     |
| BRIS-F36 | Isolate read-only observer children               | each child gets a small environment and bounded output   | an empty project env file does not clear ambient overrides  | Bristol to Samebase | injected-override checks | candidate |
| BRIS-F37 | Bind every provider read to stable identity       | main profile, account, build URL, and Worker are checked | stable attachments alone do not select a provider account   | Bristol to Samebase | live self-inspection     | candidate |
| BRIS-F38 | Keep partial evidence out of destructive gates    | exit code `2` names two unproved joins                   | cleanup must fail closed on unknown ownership               | shared              | contract and live check  | ready     |
| BRIS-F39 | Store an exact source-to-backend version join     | strict Worker annotation has commit and Convex URL       | Samebase UI still warns that the backend can be older       | Bristol to Samebase | live version read        | candidate |
| BRIS-F40 | Validate the complete regional provider hostname  | live EU preview exposed a missing regional test          | first-label parsing accepted noncanonical nested hosts      | shared              | review and live check    | ready     |
| BRIS-F41 | Expose live PR resources through the agent API    | repository observer cannot read Convex inventory         | UI shows the exact build and backend, current MCP does not  | Samebase only       | UI and MCP comparison    | candidate |
| BRIS-F42 | Test direct production hydration during dogfood   | Samebase workspace recovered after refresh               | browser console emitted React hydration error `418`         | Bristol to Samebase | one live refresh         | candidate |
| BRIS-F43 | Use one default-branch promotion for a PR stack   | merging seven slices through `main` starts seven builds  | one promotion PR keeps one cutover and all review evidence  | Bristol first       | draft PR and live reads  | ready     |
| BRIS-F44 | Verify auth environment before production merge   | profile passed, but the production log level was missing | code and docs alone did not prove the live backend setting  | Bristol first       | exact live value reads   | ready     |
| BRIS-F45 | Preflight the complete authored source model      | 8,522 lines of `.mjs` bypassed the app TypeScript check  | generated apps use Node 24, ESM, and direct `.ts` execution | shared              | correction in progress   | candidate |

## Characterization Test Plan

The checkpoint sections below record the repository state when each result was produced. Commands
and gaps in those sections are historical. The final development, runtime, preview, and decision
sections supersede them.

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

The behavior proof remains valid, but the `.mjs` choice was a process defect. The first test copied
the Bristol baseline before the manager compared it with the current Samebase generated-app source
model. Later checkpoints repeated that pattern.

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

### TanStack Start Runtime Checkpoint (Historical)

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

An independent review found no remaining blockers for a non-promoted version upload. At this
checkpoint, the full framework migration was not approved because authenticated Convex SSR and an
isolated synthetic bootstrap were not yet proven.

A later Codex pull request review found that the first output scan compared only the original and
compact JSON serializations. Vite can convert JSON to JavaScript object literals, so that scan could
miss the same private records after transformation. Bristol commit
`664a87b73b07c4db2a8bd60e3fa7709b3299dae1` adds a client-only module-graph block as the primary
control and stable content fingerprints as an independent output control. A deliberate client import
of a real year module failed before output, and synthetic tests prove the fingerprint detects the
transformed object-literal shape without printing private values.

### Authenticated SSR Checkpoint (Historical)

Bristol commits `8c10a426cf884d3cca9bc75a750672e0b861370f` and
`a59fe8ff351408dd6988b8a7e656e6039429ad3b` add and prove the Bristol-owned TanStack session bridge.

The session boundary keeps production owner-only sign-in. Synthetic account creation is possible
only when all of these facts are true:

1. the deployment profile is exactly `local_worktree`
2. Convex reports a loopback cloud URL
3. the flow is exactly `signUp`
4. the email matches one runner-provided value under `example.invalid`

The Worker accepts an access token only through a same-origin JSON request with browser fetch
metadata. It validates the token through Convex, then sets an `HttpOnly`, host-only, `SameSite=Lax`
cookie. Deployed hosts use the `__Host-` prefix and `Secure`. Known invalid tokens return an empty
`401` and remove the cookie. Backend or network failure returns an empty `503` and keeps the cookie.
The protected request middleware and server function both check the session and set
`private, no-store`.

`npm run spike:test:auth` owns this synthetic test lifecycle:

1. refuse existing `.env.local` or `.convex` state
2. create an anonymous local Convex deployment
3. generate signing keys and send them to Convex through standard input
4. create a random synthetic account and keep all credentials in parent-process memory
5. expose only the synthetic backend through a supervised Cloudflare quick tunnel
6. build and start local Workerd with strict public-fetch behavior
7. exchange the access token for the session cookie
8. render the protected synthetic canary through authenticated SSR
9. prove invalid, missing, deleted, and unavailable session behavior
10. stop every process group, remove marker-owned state, and prove all ports are closed

The complete run passes with no retained local state. A deliberate `SIGINT` first exposed a cleanup
defect: the main backend listener stopped, but the site listener and local files remained. The fixed
runner tracks bounded setup and build commands as well as the long-running backend, tunnel, and
Worker. Forced interrupts during setup and after tunnel startup now exit with code 130, remove all
runner-owned state, and leave no selected port open.

The first readiness probe tried to fetch the quick-tunnel URL from the parent Node process. The host
DNS resolver could not resolve it even after Cloudflare registered the tunnel. Local Workerd used a
different network path and completed the authenticated Convex request. The runner now treats tunnel
registration as readiness and the real Workerd request as acceptance.

Twenty-four Vitest checks, one local Workerd route suite, four local privacy and upload checks, the
unchanged Next.js and OpenNext production build, TypeScript, the private-bundle scan, and an
independent review pass. The upload wrapper now rejects a local tunnel, a missing backend URL, and
generated output that does not contain the exact root `https://*.convex.cloud` URL.

Cloudflare branch builds `999fceac-f6a0-4e54-9db6-c352138e8865` and
`7c75bd27-b548-4472-b6f1-bf521e9c76a8` passed for the two commits. The second build deployed the
isolated Convex preview and uploaded non-promoted OpenNext version
`e5b7247c-ee84-4277-81ff-30f6469c8a83`. The guarded command then built against that exact preview
URL and uploaded non-promoted TanStack version `e5e39265-fefd-4520-86fa-aed2fc385ec5`, tagged
`tanstack-spike-a59fe8f`. It is 919.44 KiB before compression and 199.09 KiB after compression.
Worker startup time is 19 milliseconds.

The live deployment remains `77f95a21-bc06-42c4-ba50-1b5f0ad9966d`. Production remains on OpenNext
version `785ac1b3-71f7-4255-8af5-55be71b10d45` at 100 percent.

This checkpoint proves first-request authenticated SSR with synthetic local state. It does not yet
prove the browser sign-in user interface, access-token renewal, refresh-token rotation, server-side
session revocation, or a safe public pull request preview. The Windows task-tree cleanup branch has
not run in Windows CI.

### Final Development Interface

The final branch keeps these distinct commands:

```text
npm run dev
npm run setup:worktree
npm run inspect:preview
npm run test:e2e
npm run test:worktree
```

`npm run dev` reads canonical Git identity. In the primary checkout, it starts Vite and the normal
Convex development service. In a linked worktree, it installs stale dependencies, runs repeatable
owned setup, and starts Vite with one anonymous loopback Convex backend.

`npm run setup:worktree` prepares or verifies the same linked-worktree state without leaving
development services running. Setup uses deterministic local ports, one random `example.invalid`
account, and an owner-bound credential file. It does not create application records.

`npm run test:e2e` creates a temporary anonymous Convex backend, installs synthetic authentication
state, builds and starts local Workerd, runs browser acceptance, and removes all runner-owned state.

`npm run test:worktree` creates an exact temporary Git worktree from committed `HEAD`. It runs two
setup, browser, service, and shutdown cycles. Each cycle proves one auth account, no retained
Bristol records, closed owned ports, and a clean temporary worktree. Final cleanup proves that Git
no longer reports that exact worktree.

Linked-worktree development fails closed on Windows because the implementation does not prove the
same process-tree cleanup and credential file permissions there. Primary development, builds, and
normal tests keep their Windows path. Preview resource cleanup remains a separate gap.

The final linked-worktree checkpoint passed 49 Node contract checks, 118 Vitest checks, the Vite
client and Worker build, the private bundle scan, TypeScript, lint with one existing warning, and
the real two-cycle acceptance.

Cloudflare build
[9712e392-ea0d-4c55-99aa-b08ecda83441](https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/bristol-tsx/production/builds/9712e392-ea0d-4c55-99aa-b08ecda83441)
built commit `aa98dcfcf3ab3a767e40bd5a1b623c337dc5c78a`. It uploaded non-promoted Worker version
`f48bbcd4-6c21-44a7-b0ed-549f1a61fd28`, version number 32, with alias
`codex-linked-worktree-development`. The
[public branch URL](https://codex-linked-worktree-development-bristol-tsx.pfp.workers.dev) passed
the route contract. The active deployment remains `77f95a21-bc06-42c4-ba50-1b5f0ad9966d` at 100
percent on the prior OpenNext version `785ac1b3-71f7-4255-8af5-55be71b10d45`.

Copied aliases `dev:primary`, `build:cloudflare`, and `start` were removed because they had no
distinct Bristol behavior or caller. All `spike:*` scripts were removed after the target runtime
became the main branch implementation.

### Read-Only Preview Inspection Checkpoint

[Bristol pull request #13](https://github.com/nicu-chiciuc/bristol_tsx/pull/13) adds
`npm run inspect:preview`. It verifies the local, canonical remote, and pull request heads before it
accepts provider evidence. It then validates the active main Cloudflare identity and exact Bristol
account before it reads recent Worker versions or the active deployment.

The child-process boundary is part of the observer contract. Git, GitHub, and Wrangler receive only
a small OS environment allowlist and the authentication source that each read needs. Wrangler cannot
load the project environment files or inherit an endpoint, output-file, runtime-injection, or
Cloudflare-token override. Raw child output is bounded and never enters the result. Direct Node
execution keeps the fixed Wrangler command shape valid on Windows.

The first observer is deliberately partial. A matching Wrangler alias identifies a version
candidate, not the source commit in that version. Wrangler returns only ten recent versions, so a
missing alias is not an absence proof. Samebase identifies the attached Convex project, but its
current MCP tools do not expose live Convex preview inventory. The preview deploy key is not a
Convex Management API inventory credential.

Cloudflare build
[320cdfab-d9a5-4846-8354-29d988f8983e](https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/bristol-tsx/production/builds/320cdfab-d9a5-4846-8354-29d988f8983e)
built commit `86fafe8cd8e046fd9f519dde09a050a46b24f791`. The observer identified non-promoted
branch-alias candidate `1f5cd843-85bb-408b-bfd2-0bb2b7911341`, and the
[public branch URL](https://codex-preview-inspection-bristol-tsx.pfp.workers.dev) passed the route
contract. Exit code `2` reported only the exact commit-to-version join and live Convex inventory as
unproved. Production deployment `77f95a21-bc06-42c4-ba50-1b5f0ad9966d` still sends 100 percent of
traffic to prior OpenNext version `785ac1b3-71f7-4255-8af5-55be71b10d45`.

### Exact Preview Ownership Checkpoint

[Bristol pull request #14](https://github.com/nicu-chiciuc/bristol_tsx/pull/14) adds one strict
`bristol.preview-binding/v1` record to each new preview Worker version. The record has only the full
commit SHA and public Convex deployment URL. The deploy wrapper creates it from verified build
metadata. A caller cannot replace the message or preview alias.

The inspector trusts the join only when the newest exact branch alias contains the current full
commit and a canonical Convex deployment URL, and the current trusted Cloudflare pull request
comment names the same Worker version prefix. It accepts the non-regional Convex hostname and the
documented `eu-west-1` hostname. It rejects extra labels, unsupported region labels, and a
region-only hostname.

Cloudflare build
[b39ea460-ecbb-4ec4-b31e-c592057fa5c1](https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/bristol-tsx/production/builds/b39ea460-ecbb-4ec4-b31e-c592057fa5c1)
built commit `c14c4d2c48953ddb6155a7cbed6b0c55cfa397de`. Worker version
`81738a13-a899-4d1a-931f-a174b60ea845` stores that full commit and
`https://first-hawk-269.eu-west-1.convex.cloud`. The
[public branch URL](https://codex-preview-ownership-bristol-tsx.pfp.workers.dev) passed the route
contract. The observer verified the exact source-to-Worker-to-backend join. Its only issue is the
unavailable live Convex inventory, so it returns the expected `partial` result with exit code `2`.

The Samebase UI shows the same final Cloudflare build and `first-hawk-269` deployment, but it still
labels the backend `May be from an earlier commit`. This is honest UI behavior because Samebase does
not yet join the resources to the exact commit. The current Samebase MCP surface does not expose
this live pull request resource view. A direct refresh also produced React hydration error `418`
before the workspace recovered. Both results are Samebase dogfood findings, not Bristol cleanup
evidence.

Production deployment `77f95a21-bc06-42c4-ba50-1b5f0ad9966d` remains unchanged at 100 percent on
prior OpenNext version `785ac1b3-71f7-4255-8af5-55be71b10d45`.

### Single Production Promotion Gate

[Bristol pull request #15](https://github.com/nicu-chiciuc/bristol_tsx/pull/15) targets `main`
directly from the final reviewed stack head. It stays draft until the operator approves the cutover.
Pull requests #8 through #14 remain the bounded review and evidence slices. This shape causes one
default-branch build instead of one production build for each stacked slice.

Opening the draft reused commit `c14c4d2c48953ddb6155a7cbed6b0c55cfa397de` and its verified preview.
An independent full-stack review then found that the production release gate did not read the two
environment values used by the new password-auth policy.

The production profile returned the exact value `production`. `AUTH_LOG_LEVEL` was absent. The
checked-in gate now requires the exact value `ERROR` and treats a missing value as a blocker. It
also forbids a full environment-variable listing because that output contains secrets. Changing the
production value remains an operator-approved cutover action.

Release-safety commit `60f667e64873f444a6b56dbd0d3b5e2583132c29` created Cloudflare build
`fbe6d907-6a50-4468-8cf9-535a6489e820`, non-promoted Worker version
`92189a3b-3ae8-4063-a22e-2df5fd5da0e0`, and Convex preview
`https://elated-rooster-256.eu-west-1.convex.cloud`. The exact binding and public route contract
pass.

The gate records this production baseline:

- source commit `2948c1c8e73a05664f1472377565e1ffb79db04b`
- Cloudflare build `6c499f2e-4173-4631-b8d6-20d213adbbf7`
- deployment `77f95a21-bc06-42c4-ba50-1b5f0ad9966d`
- Worker version `785ac1b3-71f7-4255-8af5-55be71b10d45` at 100 percent traffic
- enabled custom domain `bristol.tsx.md`
- safe root response `307` to `/signin?next=%2F`
- Samebase vault `k972pqwpnkfg9mnknzp0yq45p18b8pyw`
- attached Convex project `919034`
- attached Worker tag `67bb6bd20ba142b289bfe408fd561104`
- production profile `production`
- production `AUTH_LOG_LEVEL` absent, so the release gate is blocked

Immediately before merge, the operator must re-read the baseline and record the exact Convex
production deployment and frozen Netlify rollback deployment. The merge and the 30-minute production
observation remain outside this checkpoint.

### Samebase Preview Lifecycle Recommendation

Samebase should own live preview inventory because it already keeps the user provider connections on
the server. Bristol should write the strict non-secret version annotation. It should not receive
Cloudflare and Convex management credentials.

Keep the current annotation shape. Do not add repository and branch fields now. The verified Worker
attachment binds the repository. The verified pull request head supplies the branch, and the owned
Cloudflare alias matches it. Adding the same facts to a second schema would create duplicate state.
Reconsider the shape only if complete inventory proves that these identities are insufficient.

The next Samebase product checkpoint should add one read-only MCP action:
`vault_preview_getPullRequestInventory({ vaultId, pullRequestNumber })`. It should derive the
repository, branch, full head commit, provider attachments, and trusted checks from the vault and
pull request. It should not accept provider identities from the caller.

The read must paginate every Cloudflare Worker version page, read the exact active deployment, and
list the attached Convex project preview deployments. It can return `complete` only when:

1. the GitHub head, trusted build, Worker attachment, build URL, and full version metadata agree
2. the Worker version is not in production traffic
3. exactly one live Convex preview has `preview/<branch>`
4. its project, deployment name, and deployment URL match the Worker annotation

Return `partial` for unavailable evidence and `invalid` for malformed or contradictory evidence.
Report a resource as absent only after the complete provider list proves it.

Do not add preview deletion to MCP in the same checkpoint. Later cleanup should create a retained
plan with the terminal pull request state, head commit, exact resource IDs, expiry, and approval
URL. After explicit approval, execution must re-read every fact, stop on any change, delete only the
inactive Worker version and exact Convex preview, then prove both are absent. The existing
whole-vault deletion functions are not valid for preview cleanup because they delete the parent
Worker or Convex project.

For Cloudflare, require stable pagination totals, unique version IDs, and the complete version set.
Reject a matching alias with legacy, malformed, or unowned metadata. For Convex, use the complete
project deployment list and match the attached project, `preview/<branch>` reference, preview
identifier, deployment name, and URL. Before each deletion, re-read the terminal pull request and
active Worker deployment. If a delete response is lost or times out, read inventory before any
retry. Never make a blind destructive retry.

### Full Runtime Migration Checkpoint

[Bristol pull request #10](https://github.com/nicu-chiciuc/bristol_tsx/pull/10) is stacked on the
accepted spike in [pull request #9](https://github.com/nicu-chiciuc/bristol_tsx/pull/9). The
migration moved the protected year route, stool routes, admin, home, sign-in, disabled API, browser
session, and application navigation in separate commits.

The final browser session uses a host-only `HttpOnly` access-and-refresh cookie pair. TanStack
server functions own cookie changes. One Web Lock serializes browser session changes across tabs.
Sign-out revokes the server session and clears browser-owned private caches.

Bristol commit `193e4b106f1f4d81788e1c40d696b396baf091dd` removed the Pages Router, Next.js,
OpenNext, old middleware and session endpoint, legacy build path, and framework-only assets. The
checkpoint deleted 6,670 lines and removed 277 npm packages.

The complete local result has:

- 16 Vitest files and 118 checks
- 14 build and deployment contract checks
- lint with no error and one existing warning
- TypeScript through the isolated build path
- Vite client and Worker builds
- private client-bundle checks
- an isolated local Convex and Workerd browser acceptance run
- a production dependency audit with zero findings

The full dependency audit has eight high findings in development-only glob tooling. Compatible
updates are applied. The forced plan would downgrade lint plugins across major versions, so it is
not part of this runtime migration.

### Public Preview And Browser Checkpoint

Every branch build recreates one Convex preview, deploys the branch functions, and seeds one
synthetic `example.invalid` account. The preview uses its own deployment profile, password, JWT
private key, JWKS, and non-debug authentication logs. Public sign-up and arbitrary email sign-in are
rejected.

Cloudflare build `08246b1a-dcbd-414f-859c-1d5d753ad088` built final Bristol commit
`dc44e63c2f283e4db187ba0ea95d48e383450e7e`. It ran from 05:06:57 UTC to 05:07:44 UTC on 30 July 2026
and finished successfully. It created Convex preview `preview/codex-tanstack-migration`, Worker
version `d5933b1e-6c98-4afd-b4ab-6938e3e71fc0`, version number 29, and alias
`codex-tanstack-migration`.

The public branch URL is
[codex-tanstack-migration-bristol-tsx.pfp.workers.dev](https://codex-tanstack-migration-bristol-tsx.pfp.workers.dev).
The exact branch head passed the public route contract. The main Chrome profile for
`nicuchiciuc@gmail.com` then proved:

- synthetic preview sign-in
- authenticated home, admin, year, and stool routes
- one synthetic stool create and delete
- sign-out and a private-route redirect
- one arbitrary account rejection with the invalid-credentials result

Cloudflare preview URLs do not provide Workers Logs. Build result, Worker version, public HTTP
contract, and named-browser acceptance are separate evidence.

The active production deployment is still `77f95a21-bc06-42c4-ba50-1b5f0ad9966d`. It still sends 100
percent of production traffic to OpenNext version `785ac1b3-71f7-4255-8af5-55be71b10d45`.

### Credential Handling Incident

A browser DOM snapshot was taken after the preview password field had been filled. The tool output
contained the input value.

The preview was disabled during repair. The synthetic email, password, JWT private key, and JWKS
were rotated. A new Convex preview and Worker version were built before public access returned. The
old values stopped working. Temporary browser, process, named-pipe, and clipboard state was cleared.

The new rule is direct: never capture browser DOM state while a credential field contains a value.
Select and show the browser profile before a credential or provider check. Use a real replace
operation for each field. Verify only that the resulting lengths match the expected lengths before
submission. Do not return either value.

### TypeScript Source Model Incident

The migration used `.mjs` for handwritten Node scripts, tests, ESLint configuration, and PostCSS
configuration. The final branch had 8,522 lines in these files. The application TypeScript
configuration included `.ts` and `.tsx` application files, so it did not type-check this automation.

The failure started in the first characterization checkpoint. The Bristol baseline already used
`.mjs`, and the first new test copied that pattern. About 30 later commits treated the extension as
an established local convention.

The Samebase contract already had the missing answer:

- the repository and generated applications use `"type": "module"`
- Node 24 runs TypeScript helper files directly
- generated helper scripts use normal `.ts` files
- Samebase research states that scripts are TypeScript

The adoption method mapped package-script names and runtime behavior, but it did not require a
source-model preflight. The public Samebase skill told the worker to read repository instructions,
but Bristol had no repository instruction file. The always-loaded Samebase rule also described
portable TypeScript automation without saying that all handwritten automation must be TypeScript.

The manager did not compare Bristol with the current generated-app contract before the first test.
Review prompts checked deployment behavior, security, and preview ownership. They did not check
whether all handwritten code was inside the TypeScript proof.

The correction standard is:

1. pin Node 24
2. set package `"type": "module"`
3. use normal `.ts` for handwritten Node scripts, tests, and supported configuration
4. run those files directly with Node and use explicit `.ts` relative imports
5. use TypeScript syntax that Node can erase
6. type-check application code and Node automation with strict configurations
7. run the source guard and both type checks in the real Cloudflare build
8. reject handwritten JavaScript and special TypeScript module extensions
9. allow only generated Convex JavaScript and the browser-delivered service worker JavaScript

The process correction has three parts: convert Bristol, add the source-model preflight to this
method, and make the Samebase rule visible in both repository and public agent guidance.

## TanStack Start Decision Gate

Current official guidance provides a direct Cloudflare Workers path with TanStack Start, the
Cloudflare Vite plugin, a Worker server entry, server functions, server routes, streaming, static
assets, environment bindings, and non-promoted Worker version uploads.

Convex documents the TanStack Start query integration, but its Convex Auth documentation does not
provide the complete server session contract needed here. Bristol owns and tests that narrow session
bridge.

The isolated preview spike must prove:

1. one public server-rendered route with hydration and client navigation
2. one protected server-rendered route with no private body before authentication
3. one protected server endpoint and direct unauthorized-call rejection
4. first-request Convex identity, authenticated query, refresh, and sign-out
5. typed Worker bindings and secrets without client-bundle leakage
6. static assets, streaming, and the current PWA assets
7. one non-promoted branch build and Worker version
8. an isolated Convex backend with a safe synthetic user and data bootstrap

All eight items pass. The branch also passes browser refresh, sign-out, cross-tab coordination,
session revocation, full route parity, safe preview bootstrap, public preview access, and old
framework removal.

The framework decision gate is complete. Production cutover remains a separate release decision. Do
not merge the migration branch until the operator gives explicit approval for the same-Worker
production cutover.

## Sources

- [Bristol package scripts](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/package.json#L5-L23)
- [Bristol private-route middleware](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/src/middleware.ts#L9-L78)
- [Bristol stool functions](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/convex/stools.ts#L20-L87)
- [Bristol persistent query cache](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/src/lib/convexQueryCache.ts#L29-L165)
- [Samebase worktree setup](https://github.com/samebase/samebase/blob/aee7798e5cc9cf5e5c4e729fe0d05c8301ef24a5/scripts/run-worktree-dev.ts#L199-L399)
- [Samebase Cloudflare build modes](https://github.com/samebase/samebase/blob/aee7798e5cc9cf5e5c4e729fe0d05c8301ef24a5/apps/samebase/scripts/build-cloudflare.ts#L94-L165)
- [Samebase generated-app Node pin](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/apps/samebase/convex/starterSeedManifest.generated.ts#L85)
- [Samebase generated-app package and TypeScript scripts](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/apps/samebase/convex/starterSeedManifest.generated.ts#L143-L168)
- [Samebase TypeScript stack decision](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/research/2026-07-06-stack-decision-rationale-interview.md#L72-L74)
- [Samebase preview cleanup](https://github.com/samebase/samebase/blob/aee7798e5cc9cf5e5c4e729fe0d05c8301ef24a5/docs/samebase-pr-preview-cleanup.md#L20-L166)
- [Samebase pull request resource read](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/apps/samebase/convex/vault/pullRequestResources.ts#L659-L718)
- [Samebase Cloudflare version reads](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/apps/samebase/convex/cloudflareResources.ts#L2259-L2307)
- [Samebase provider connection boundary](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/apps/samebase/convex/providerConnectionModel.ts#L46-L94)
- [Samebase retained provider-action pattern](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/apps/samebase/convex/vault/deletion/providerActions.ts#L84-L176)
- [Samebase preview cleanup approval boundary](https://github.com/samebase/samebase/blob/25fb3d8057ef76ac9e6482f9edf3d4371d62f0f8/rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md#L307-L318)
- [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [TanStack Start migration from Next.js](https://tanstack.com/start/latest/docs/framework/react/migrate-from-next-js)
- [Convex TanStack Start guide](https://docs.convex.dev/client/tanstack/tanstack-start/)
- [Convex Auth documentation](https://docs.convex.dev/auth/convex-auth)
- [Bristol authenticated SSR runner](https://github.com/nicu-chiciuc/bristol_tsx/blob/a59fe8ff351408dd6988b8a7e656e6039429ad3b/scripts/test-tanstack-auth-spike.mjs)
- [Bristol final deployment contract](https://github.com/nicu-chiciuc/bristol_tsx/blob/dc44e63c2f283e4db187ba0ea95d48e383450e7e/docs/cloudflare-workers-deployment.md)
- [Bristol final migration record](https://github.com/nicu-chiciuc/bristol_tsx/blob/dc44e63c2f283e4db187ba0ea95d48e383450e7e/research/2026-07-30-next-to-tanstack-start-workers.md)
- [Bristol final branch build](https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/bristol-tsx/production/builds/08246b1a-dcbd-414f-859c-1d5d753ad088)
- [Bristol linked-worktree scripts](https://github.com/nicu-chiciuc/bristol_tsx/blob/aa98dcfcf3ab3a767e40bd5a1b623c337dc5c78a/package.json#L5-L31)
- [Bristol linked-worktree operating contract](https://github.com/nicu-chiciuc/bristol_tsx/blob/aa98dcfcf3ab3a767e40bd5a1b623c337dc5c78a/docs/cloudflare-workers-deployment.md#L198-L314)
- [Bristol linked-worktree adoption findings](https://github.com/nicu-chiciuc/bristol_tsx/blob/aa98dcfcf3ab3a767e40bd5a1b623c337dc5c78a/research/2026-07-30-next-to-tanstack-start-workers.md#L271-L360)
- [Bristol preview inspector](https://github.com/nicu-chiciuc/bristol_tsx/blob/86fafe8cd8e046fd9f519dde09a050a46b24f791/scripts/inspect-preview.mjs#L1-L662)
- [Bristol preview inspector contracts](https://github.com/nicu-chiciuc/bristol_tsx/blob/86fafe8cd8e046fd9f519dde09a050a46b24f791/tests/characterization/preview-inspection.test.mjs#L1-L559)
- [Bristol read-only inspection contract](https://github.com/nicu-chiciuc/bristol_tsx/blob/86fafe8cd8e046fd9f519dde09a050a46b24f791/docs/cloudflare-workers-deployment.md#L200-L242)
- [Bristol preview-inspection findings](https://github.com/nicu-chiciuc/bristol_tsx/blob/86fafe8cd8e046fd9f519dde09a050a46b24f791/research/2026-07-30-next-to-tanstack-start-workers.md#L364-L418)
- [Bristol strict preview metadata](https://github.com/nicu-chiciuc/bristol_tsx/blob/c14c4d2c48953ddb6155a7cbed6b0c55cfa397de/scripts/worker-version-metadata.mjs#L1-L80)
- [Bristol owned preview upload](https://github.com/nicu-chiciuc/bristol_tsx/blob/c14c4d2c48953ddb6155a7cbed6b0c55cfa397de/scripts/deploy-cloudflare.mjs#L42-L85)
- [Bristol exact preview join](https://github.com/nicu-chiciuc/bristol_tsx/blob/c14c4d2c48953ddb6155a7cbed6b0c55cfa397de/scripts/inspect-preview.mjs#L300-L478)
- [Bristol exact ownership contract](https://github.com/nicu-chiciuc/bristol_tsx/blob/c14c4d2c48953ddb6155a7cbed6b0c55cfa397de/docs/cloudflare-workers-deployment.md#L148-L246)
- [Bristol production-promotion pull request](https://github.com/nicu-chiciuc/bristol_tsx/pull/15)
- [Bristol production auth settings](https://github.com/nicu-chiciuc/bristol_tsx/blob/60f667e64873f444a6b56dbd0d3b5e2583132c29/docs/cloudflare-workers-deployment.md#L124-L141)
- [Bristol production release gate](https://github.com/nicu-chiciuc/bristol_tsx/blob/60f667e64873f444a6b56dbd0d3b5e2583132c29/docs/cloudflare-workers-deployment.md#L397-L428)
- [Cloudflare Worker Versions API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/)
- [Node.js TypeScript modules](https://nodejs.org/dist/latest/docs/api/typescript.html)
- [Cloudflare Workers Builds image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Convex deployment URL contract](https://docs.convex.dev/management-api/create-deployment)
- [Convex list deployments](https://docs.convex.dev/management-api/list-deployments)
- [Convex delete deployment](https://docs.convex.dev/management-api/delete-deployment)
- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)

## Checkpoints

1. Process charter, capability inventory, and test plan: complete
2. Framework-neutral characterization tests: complete
3. TanStack Start and Cloudflare preview spike: complete
4. Runtime migration: branch complete, production cutover pending
5. Preview gate definition: complete; linked-worktree development: complete; exact preview
   ownership: complete; read-only preview inspection: implemented with partial evidence; preview
   cleanup: pending; production promotion: draft gate open, not run
6. Bidirectional findings and portable outputs: complete for the first case, candidate until a
   second project tests them
