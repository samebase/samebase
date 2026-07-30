# Bristol TSX Netlify to Cloudflare Workers Migration

## Document Control

- Status: completed case study
- Date: 2026-07-29
- Repository: [nicu-chiciuc/bristol_tsx](https://github.com/nicu-chiciuc/bristol_tsx)
- Migration: [pull request 6](https://github.com/nicu-chiciuc/bristol_tsx/pull/6)
- Authentication recovery: [pull request 7](https://github.com/nicu-chiciuc/bristol_tsx/pull/7)
- Runbook: [existing application migration](../docs/existing-app-cloudflare-workers-migration.md)

This note keeps only the findings that should change Samebase or the next migration. Bristol owns
its deployment identifiers, build history, validation output, and monitoring evidence.

## Result

Bristol needed a Worker server runtime because it had server-rendered private routes and an API
route. Cloudflare Workers now serves the existing public hostname. The Netlify deployment stayed
available as the tested rollback target.

The first public cutover exposed a rejected saved browser login that anonymous route probes did not
find. The app treated the rejection as a provider outage and could not clear the saved credentials.
The team restored Netlify, fixed the rejection path, and repeated the cutover. This established one
durable gate: test the operator's existing named browser profile before and after a hostname change.

## Useful Samebase Boundary

Samebase correctly supplied stable repository, Convex, Worker, account, and build-trigger
identities. This prevented duplicate resource creation and work in the wrong provider account.

Samebase inventory is not terminal provider evidence. A ready attachment or started workflow does
not prove a successful build, uploaded version, active deployment, or working public route.

## Product and Process Findings

| Finding                                                                | Required response                                                                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Production and preview builds need different Convex authority.         | Model each trigger separately and never give a preview build the production deploy key.                                       |
| Provider configuration and production promotion were one action.       | Make configuration and production start separate operations.                                                                  |
| The first build command followed the wrong package-manager assumption. | Record the intended package manager and complete toolchain before delegation. Classify each difference from the target stack. |
| Browser handoff first used a guest profile.                            | Show the browser profile and account before provider work. Use the operator's named profile for the cutover gate.             |
| The Convex Auth setup guidance pinned an old Auth.js core release.     | Update the source skill and generated copies together, then run a production dependency audit.                                |

Bristol kept npm because its repository and Cloudflare command contract used npm. Samebase remains
pnpm-first. Vite Plus, Oxlint, Oxfmt, ESM, and TypeScript automation are separate stack decisions.
The manager must inspect all of them before implementation. Similar framework names do not prove a
similar toolchain.

## Reusable Sequence

1. Record source, host, backend, domain, authentication, and rollback facts.
2. Read Samebase inventory and reuse exact existing resources.
3. Characterize private routes and saved-session behavior.
4. Record the target toolchain before implementation or delegation.
5. Separate production and preview credentials.
6. Validate the exact branch commit without changing production traffic.
7. Cut over with the old host ready for rollback.
8. Use live provider reads and the named browser profile as release evidence.

## Sources

- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Auth.js core 0.41.3 release](https://github.com/nextauthjs/next-auth/releases/tag/%40auth%2Fcore%400.41.3)
- [Samebase agent reference](https://samebase.com/llms.txt)
