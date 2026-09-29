# Worker Previews repository rollout

## Scope and completion rule

This rollout uses the 29 repositories returned by the connected Samebase inventory on September
29, 2026. Each repository was inspected independently. The starter changelog is the common migration
procedure. Its working label was v2059 when application started, and its current PR label is v2060.
Unrelated starter upgrades were not included.

Twenty-six repositories need an update. Three are not relevant. The 26 comprise this monorepo, three
exported repositories, and 22 independent apps. No repository was unavailable.

A prepared pull request is not a completed provider rollout. No provider settings were manually
changed. No production deployment or merge was requested. Repository pushes can start existing CI
and Cloudflare preview builds; their results still need verification. Existing Worker connections
still need the one-time Cloudflare switch, build settings, and real branch verification. Convex apps
also need separate production and preview build secrets under the same key name.

## Repository results

All rows marked `update needed` still have provider or publication steps pending. The PR column
records the code change, not a claim that the live app uses Worker Previews.

| Repository                                               | Initial result | Code change                                                                                | Verification or exception                                                                                                                                |
| -------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| samebase/tmp-h-gurii                                     | update needed  | [PR 1](https://github.com/samebase/tmp-h-gurii/pull/1)                                     | 15 focused tests, normal build, and production dry run passed                                                                                            |
| samebase/static-hosting                                  | not relevant   | None                                                                                       | Convex component and CLI library, no Worker deploy path                                                                                                  |
| samebase/scout                                           | update needed  | [PR 213](https://github.com/samebase/scout/pull/213)                                       | 28 focused tests, types, lint, build, and production dry run passed; Convex Static Hosting and release checks preserved                                  |
| samebase/fly                                             | update needed  | [PR 2](https://github.com/samebase/fly/pull/2)                                             | 15 focused tests, normal build, and dry run passed; separate workstation Container Worker unchanged                                                      |
| samebase/mail                                            | update needed  | [Draft PR 3](https://github.com/samebase/mail/pull/3)                                      | 26 focused tests, normal build, and production dry run passed; preview R2, email, backend URL, and runtime secrets need isolated configuration           |
| nicu-chiciuc/ObsidianMain                                | not relevant   | None                                                                                       | Document repository                                                                                                                                      |
| samebase/sidebars                                        | not relevant   | None                                                                                       | Exported UI library, no Worker deploy path                                                                                                               |
| samebase-live-tests/tmp-plugin-review-9806-20260905-1434 | update needed  | [PR 1](https://github.com/samebase-live-tests/tmp-plugin-review-9806-20260905-1434/pull/1) | 15 focused tests, normal build, and production dry run passed                                                                                            |
| samebase/samebase                                        | update needed  | [PR 1562](https://github.com/samebase/samebase/pull/1562)                                  | Starter, docs, main app, Sidebars example, domain router, and PostHog proxy                                                                              |
| samebase/sidebars-example                                | update needed  | Monorepo PR 1562, then export                                                              | Standalone example build and production dry run passed                                                                                                   |
| nicu-chiciuc/ailegis-same                                | update needed  | [PR 14](https://github.com/nicu-chiciuc/ailegis-same/pull/14)                              | 11 focused tests, checks, build, ASSETS runtime probe, and production dry run passed; existing dependency audit failure                                  |
| nicu-chiciuc/score-four                                  | update needed  | [PR 5](https://github.com/nicu-chiciuc/score-four/pull/5)                                  | 11 focused tests, types, build, and production dry run passed; branch-head checks preserved; existing dependency audit failure                           |
| nicu-chiciuc/chessmerge                                  | update needed  | [PR 55](https://github.com/nicu-chiciuc/chessmerge/pull/55)                                | Three deploy tests, types, build, and production dry run passed; deliberate Convex `--preview-create` behavior preserved                                 |
| nicu-chiciuc/planable-logo                               | update needed  | [PR 3](https://github.com/nicu-chiciuc/planable-logo/pull/3)                               | Build and production dry run passed                                                                                                                      |
| nicu-chiciuc/event-miner                                 | update needed  | [PR 3](https://github.com/nicu-chiciuc/event-miner/pull/3)                                 | Type check, build, and production dry run passed                                                                                                         |
| nicu-chiciuc/elm-gears-challenge                         | update needed  | [PR 3](https://github.com/nicu-chiciuc/elm-gears-challenge/pull/3)                         | Existing Elm compiler has no macOS ARM binary; supported-host build and dry run pending                                                                  |
| nicu-chiciuc/triangle-image                              | update needed  | [PR 3](https://github.com/nicu-chiciuc/triangle-image/pull/3)                              | Build and production dry run passed                                                                                                                      |
| nicu-chiciuc/fractal-circles                             | update needed  | [PR 3](https://github.com/nicu-chiciuc/fractal-circles/pull/3)                             | Existing no-build command and production dry run passed; asset allowlist unchanged; Cloudflare build failed, log access unavailable                      |
| nicu-chiciuc/impossible-object                           | update needed  | [PR 3](https://github.com/nicu-chiciuc/impossible-object/pull/3)                           | Build and production dry run passed                                                                                                                      |
| nicu-chiciuc/spiro                                       | update needed  | [PR 4](https://github.com/nicu-chiciuc/spiro/pull/4)                                       | Existing no-build command and production dry run passed; asset allowlist unchanged                                                                       |
| nicu-chiciuc/iterseg                                     | update needed  | [PR 4](https://github.com/nicu-chiciuc/iterseg/pull/4)                                     | No-build command and production dry run passed; existing Pages check means live provider connection still needs confirmation                             |
| samebase-live-tests/tmp-my-cool-app2                     | update needed  | [PR 2](https://github.com/samebase-live-tests/tmp-my-cool-app2/pull/2)                     | 15 focused tests, normal build, and dry run passed; older prerender and routing entries remain separate work                                             |
| samebase/base                                            | update needed  | Monorepo PR 1562, then export                                                              | Template checks, 23 tests, app build, and production dry run passed                                                                                      |
| samebase/plugin                                          | update needed  | Monorepo PR 1562, then export                                                              | Shared changelog and plugin checks updated; no app deployment                                                                                            |
| nicu-chiciuc/weight_tsx                                  | update needed  | [PR 7](https://github.com/nicu-chiciuc/weight_tsx/pull/7)                                  | 11 focused tests, types, build, and production dry run passed; auth, service worker, and branch-head checks preserved; existing dependency audit failure |
| nicu-chiciuc/teardown-noita-3d                           | update needed  | [PR 15](https://github.com/nicu-chiciuc/teardown-noita-3d/pull/15)                         | Provider build, type checks, eight-asset verifier, production dry run, and one Chromium smoke passed                                                     |
| nicu-chiciuc/bristol_tsx                                 | update needed  | [Draft PR 23](https://github.com/nicu-chiciuc/bristol_tsx/pull/23)                         | 71 app tests, 75 contracts, checks, offline build, and production dry run passed; native Preview inspection needs a populated live response              |
| nicu-chiciuc/tic-tac-toe-4x4x4                           | update needed  | [PR 3](https://github.com/nicu-chiciuc/tic-tac-toe-4x4x4/pull/3)                           | Six focused tests, types, redirects, build, and production dry run passed                                                                                |
| nicu-chiciuc/tsx_md                                      | update needed  | [PR 28](https://github.com/nicu-chiciuc/tsx_md/pull/28)                                    | Shared UI build, app type check/build, and production dry run passed; only `apps/tsx_md` changed                                                         |

The export targets are not patched independently. `templates/base`, `packages/plugin`, and
`apps/sidebars-example` remain their source. Their publication follows the normal main-branch export
workflow after approval to merge.

## What the propagation test found

The guide supports the simple static apps without app-specific instructions. It also identifies the
Convex key and auth-target changes. The audit found cases that a file-copy update would damage:

- Scout publishes and verifies Convex static assets before the Cloudflare deploy.
- ChessMerge deliberately recreates named Convex previews to receive project auth defaults.
- Mail needs isolated runtime resources. An empty `previews` block would be incomplete.
- Bristol has custom metadata, backend URL, branch-head, and production safety checks.
- Fly has a separate Container deployment. TSX MD deploys from a nested app directory.
- Existing static apps use both npm and pnpm, and some default branches are named `master`.

The first application pass found two guide details that need to be explicit: build before a manual
deployment after removing a build-owning wrapper, and remove unsupported preview dry-run aliases.
Independent review found and fixed missing build steps in the TSX MD and Teardown production dry-run
scripts. Those commands passed after the fixes. An app with missing runtime configuration needs an
incomplete draft, not a false code-ready result.

The native preview command also rejects `--keep-vars` and `--strict`. Bristol showed that a custom
version-preview inspector needs its own native Preview response verification. These points are now
in the guide.

The process correctly separates exported repositories, apps, and libraries. It does not prove the
provider rollout, preview URL, PR comment, authentication, or data isolation until a real build
runs.

## Samebase API gate

The public release adds a worker-level Builds API. Its migration removes the legacy preview trigger.
The draft Samebase change updates discovery, creation, key rotation, and cleanup to use that API.
The production trigger still matters for manual production builds and matching build history. New
connections enable Worker Previews. Existing legacy connections fail closed until the operator
completes the irreversible switch. The code does not call the migration endpoint.

Normal build-setting updates leave existing Previews unchanged. Key rotation updates only the
specified preview build secrets on existing Previews because the prior Convex key is revoked. The
new response shape, masked secret readback, preservation of unrelated secrets, and propagation to
existing Previews still need live verification. Five success-path tests remain TODO pending a
sourced provider response. This is a release blocker, not completed API validation.

The local Wrangler OAuth login returned HTTP 403 for read-only Builds requests. Suitable Workers CI
read access is required to capture and verify the new response. See the
[API findings](./2026-09-29-worker-previews-defaults.md#builds-api-changes).

## Validation scope

The monorepo starter/configuration checkpoint passed 88 focused backend, build-plan, manifest, and
export tests. The docs component passed 12 tests. The template's normal build passed its 23 tests,
format, lint, frontend/Node/Convex type checks, redirect check, and prerender build. Samebase and
the standalone Sidebars example built successfully. All five updated Worker configurations passed a
production dry run with Wrangler 4.136.2. Script type checks and plugin checks passed.

No full Samebase test suite or live preview deployment was claimed. Teardown's required one-test
Chromium smoke passed in 13.3 seconds. The independent PRs contain their focused command results.

The new API patch passed 123 tests across seven affected files, with five explicit TODO cases. One
provisioning composition test exceeded its fake-timer pump limit in the combined run and passed
alone without changes. The positive worker-level response cases remain blocked as described above.

### Remaining check failures

- Ailegis, Score Four, and Weight fail their production dependency audit because `js-yaml@4.3.1` is
  already in their default-branch lockfiles through TanStack/xmlbuilder2. The migration preserves
  that version. [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) identifies
  `4.3.2` as patched. Dependency repair is separate work; these PRs are not green.
- Planable Logo, Event Miner, Triangle Image, Fractal Circles, and Impossible Object have failed
  Cloudflare checks. GitHub supplies no error annotations, and the current connection cannot read
  Builds logs. Their causes are unclassified. Fractal's build is
  `e693a282-02d7-4bca-ab80-b93e17880c33`.
- Elm Gears needs a supported build host for its existing Elm 0.18 compiler.
- Bristol's successful offline build used only a command-scoped loopback `VITE_CONVEX_URL`. It
  proves packaging, not backend connectivity. Its read-only native Preview inspection returned
  partial because Cloudflare returned an empty Preview list.

## Ownership

Root owns the monorepo template, docs, changelog, generated starter, and integration. Separate
agents audited the two repository groups, updated the docs, and applied the guide to independent app
branches. Independent apps use `nicu-worker-previews` branches in isolated clones. The user's
unrelated template `AGENTS.md` edit is preserved and is not part of the migration.
