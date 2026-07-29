# Bristol TSX Netlify to Cloudflare Workers Migration

## Document Control

- Status: completed migration record
- Owner: Samebase existing-repository provider adoption
- Date: 2026-07-29
- Repository: [nicu-chiciuc/bristol_tsx](https://github.com/nicu-chiciuc/bristol_tsx)
- Application pull request: [pull request 6](https://github.com/nicu-chiciuc/bristol_tsx/pull/6)
- Authentication recovery pull request:
  [pull request 7](https://github.com/nicu-chiciuc/bristol_tsx/pull/7)
- Samebase vault: `k972pqwpnkfg9mnknzp0yq45p18b8pyw`
- Cloudflare Worker attachment: `rs70qkhg4w8xb1fsmxq9efdtfd8b9jqz`
- Convex attachment: `k57zh969ceqg0ydb0g90tab4458b8p0k`
- Related runbook:
  [existing application migration](../docs/existing-app-cloudflare-workers-migration.md)
- Related manual test:
  [HOST-001 existing repository cutover](../manual-tests/HOST-001-existing-repository-cloudflare-cutover.md)

## Result

The application needs a server runtime. It has a Next.js Pages Router server-rendered year route and
a Next.js API route. The migration therefore uses OpenNext on Cloudflare Workers. It does not use a
static export.

Before the cutover, Netlify was the production host at `https://bristol.tsx.md`. The GitHub
repository homepage pointed to the stale Vercel URL `https://cara-care-d3.vercel.app`. The public
hostname stayed `bristol.tsx.md`.

Cloudflare Workers now serves the public hostname. Netlify build status is `Stopped`, and its last
deployment remains available as the rollback target. The Netlify site was not deleted.

## Baseline

| Item                  | Value                                            |
| --------------------- | ------------------------------------------------ |
| Source default branch | `main`                                           |
| Source baseline       | `21adc661a59269e3fd1fe84ddb80657d670b4c51`       |
| Public production URL | `https://bristol.tsx.md`                         |
| Netlify deployment    | `6a4d923dfe10ed0008538179`                       |
| Netlify DNS target    | `bristol-tsx.netlify.app`                        |
| DNS record            | proxied CNAME `a3b1f0f8eaf8160198a76b6f2b24e885` |
| Original runtime      | Next.js `16.1.1`, no Cloudflare adapter          |
| Cloudflare account    | `fe57d01d7ab41f60d00ba1aade20eb33`               |
| Cloudflare zone       | `tsx.md`, `ecac914a0924c6432fb13acd68af9775`     |
| Worker                | `bristol-tsx`                                    |
| Worker stable tag     | `67bb6bd20ba142b289bfe408fd561104`               |
| Original Worker state | no version, deployment, route, or custom domain  |
| Convex project        | project `919034`, team `38516`                   |
| Convex production     | deployment `brave-alligator-312`                 |
| Production trigger    | `6a81c749-2bfe-4651-b078-afa33966f265`           |
| Preview trigger       | `9ab6b44d-9762-4b0a-bd49-ff90aab24419`           |

Samebase reports source setup and top-level provider setup as ready. It reports `fileCount: 0`.
After the split-secret configuration, Worker discovery reports
`convexBuildAccess.state: incomplete`. Cloudflare provider reads are still required to know build
and deployment state.

## Runtime and Security Changes

- Next.js moved to `16.2.12`.
- OpenNext Cloudflare `1.20.2` and Wrangler `4.115.0` provide the Worker build and upload path.
- `@convex-dev/auth` moved to `0.0.94`.
- `@auth/core` moved to the security-fixed `0.41.3` release.
- Public password sign-up was removed.
- A server-validated session cookie and Next.js middleware stop private SSR before render.
- The session write requires `Sec-Fetch-Site: same-origin`, a matching `Origin` host, and JSON.
- Production and preview builds receive separate Convex deploy keys.
- Public Worker version preview URLs stay off because the empty preview deployment has no safe
  account bootstrap.

The production dependency audit reports no critical finding. It reports three high findings in
nested Next.js PostCSS and optional Sharp dependencies. The app builds reviewed local CSS and does
not use image transforms. The proposed npm fix would move Next.js outside the selected OpenNext peer
range, so it was not applied.

## Validation Evidence

Local validation passed:

- lint, with four existing warnings and zero errors
- type check
- Next.js and OpenNext build
- production and preview upload dry runs
- Convex production rollback dry run
- local `workerd` route checks

The local route checks proved:

- an unauthenticated private year route returns `307` to sign-in with a zero-byte body
- a forged session cookie is cleared and returns the same safe redirect
- the sign-in page returns `200` and has no sign-up action
- the disabled raw API returns `400`
- invalid same-origin session data returns `401`
- cross-site, cross-scheme, or missing fetch metadata returns `403`

Selected Cloudflare branch builds:

| Build                                  | Source    | Result | Finding                                                      |
| -------------------------------------- | --------- | ------ | ------------------------------------------------------------ |
| `d98ab738-d6e3-4988-807d-382962bd7c39` | `d0adc6e` | failed | trigger still used the wrong package-manager command         |
| `1fcc9366-03e4-4761-a1b3-391550bbc137` | `16d0c07` | failed | provider build did not have committed Convex generated files |
| `9c335180-d7f1-4393-92e7-4241e5037301` | `42b7504` | passed | first full preview build and version upload                  |
| `385fca1b-7241-42d6-ac42-a9fcca04d060` | `19de1ea` | passed | final session-origin security change                         |
| `8c36866f-8bd5-4217-b3b9-821f2737ad58` | `891ac09` | passed | Netlify stop rule and operator record                        |
| `708b1185-a9ce-49b1-b32b-4ee9be00ccbd` | `ce883f7` | passed | rejected-session recovery and provider-outage separation     |

Build `385fca1b-7241-42d6-ac42-a9fcca04d060` created Worker version
`b2eaac8c-3d12-4ced-bfc3-6be9ab5c50cf`. It did not create a production deployment. Build
`708b1185-a9ce-49b1-b32b-4ee9be00ccbd` created Worker version
`e12b1816-f6c5-4943-993b-86859a4fe835`. It also did not create a production deployment. It ran from
17:34:20 UTC to 17:37:50 UTC, took 210 seconds, and uploaded 7,374.59 KiB (1,432.83 KiB gzip).

The
[application operator record](https://github.com/nicu-chiciuc/bristol_tsx/blob/2948c1c8e73a05664f1472377565e1ffb79db04b/docs/cloudflare-workers-deployment.md#build-variables)
contains the complete attempt history. It records six earlier missing-Convex-URL failures. This
selected table contains the builds that changed a migration decision.

## First Cutover and Rollback

Application pull request 6 merged as commit `3b6e6f75acf4d9ded9dd7763bb7f4a10aaed2ea9`. Production
build `1de66fbc-3376-4b99-9453-1d4fe8156061` passed and created Worker version
`14454c9f-d8ab-4916-a584-0de7a97f47e2` and deployment `8f07c629-f5b8-49b2-83aa-1326984f38dd`.

The `workers.dev` safe route checks passed. Warm route CPU time stayed between 1 ms and 9 ms, and
the checked requests had no exception or HTTP 5xx result.

The first public cutover created Workers Custom Domain `fca1043d03b4a8d8d382a561182cf43faabf1a20`
and managed DNS record `17f44a018da3b508430f93d12649507c`. Direct public route checks passed.

The named `Nicu` Chrome profile then exposed a condition that direct anonymous checks could not
find. Its saved Convex token was rejected by the new server session validation. The client treated
the 401 response as a service outage and could not remove the saved access and refresh tokens.

The cutover was rolled back immediately. The Worker custom domain was detached, and proxied CNAME
`bdadcf79c8e7f1d32cb4de9d77bb02e8` restored `bristol.tsx.md` to `bristol-tsx.netlify.app`.

The recovery change separates rejected credentials from provider outages. A rejected credential
returns 401 and removes the saved browser tokens. A provider or network failure returns 503 and
keeps the saved login. Local checks cover both results before the second cutover.

## Samebase Action Trace

1. Connected the existing private GitHub repository as a Samebase vault.
2. Discovered and attached Convex project `919034`.
3. Discovered and attached Worker `bristol-tsx`.
4. Read the live production and preview trigger IDs from Cloudflare.
5. Kept only `CONVEX_DEPLOY_KEY` on production.
6. Kept only `PREVIEW_CONVEX_DEPLOY_KEY` on preview.
7. Kept `SAMEBASE_CONVEX_PROJECT` on both triggers.
8. Changed both trigger build commands to `npm run build`.
9. Set production deploy to `npm run deploy`.
10. Set preview deploy to `npm run deploy:preview`.
11. Used provider-native reads for each terminal build and Worker version.

The broad Samebase trigger configuration action was not used. It would have written both deploy keys
to both triggers and started a production build before the branch was ready.

## Samebase Product Findings

### 1. Ready Does Not Mean Deployed

`providerSetup.status: ready` means that Samebase attached and configured the provider resources. It
does not include the last build outcome, active Worker version, deployment ID, or production URL.

Effect: an agent can report a false success if it stops at Samebase inventory.

Required change: show terminal build state and the active deployment as a separate observation.

### 2. Trigger Secret Scope Is Too Broad

The combined key-rotation action writes production and preview keys to both triggers.

Effect: a compromised preview build receives a production deploy credential.

The Bristol least-privilege layout leaves only `CONVEX_DEPLOY_KEY` on production and only
`PREVIEW_CONVEX_DEPLOY_KEY` on preview. Current Samebase Worker discovery reports this as
`incomplete`, while the top-level provider setup remains `ready`.

Required change: model the two trigger secret requirements separately, accept the split layout as
configured, and show the exact variable-name plan before the write.

### 3. Configuration Starts Production Too Early

The trigger configuration action starts a production build.

Effect: it combines configuration with promotion and removes the branch validation gate.

Required change: make configuration and production start separate actions.

### 4. Package Manager Detection Was Wrong

The live trigger used `pnpm` although the repository uses npm and has `package-lock.json`.

Effect: the first migration build failed before it could test the application.

Required change: derive the package manager from the committed lock file and show the selected
command.

### 5. Provider Terminal State Is Missing

Samebase does not expose a terminal Cloudflare build ID, build outcome, Worker version, deployment,
or custom domain operation.

Effect: the agent must leave Samebase for all release gates and the monitoring record.

Required change: add read-only provider observations. A started workflow is not a deployment.

### 6. Repository Inventory Is Incomplete

The connected vault reports `fileCount: 0`.

Effect: Samebase cannot show that it inspected the repository content used for framework and
package-manager decisions.

Required change: report source synchronization completeness, commit, tree, and file count.

### 7. Preview Terms Are Ambiguous

Cloudflare has a non-production build trigger, an uploaded Worker version, a public version preview
URL, and a Convex preview deployment. These are separate things.

Effect: the word "preview" can hide whether a build ran, a version exists, or public traffic can
reach it.

Required change: use the terms branch build, version upload, public version URL, and Convex preview
deployment.

### 8. Browser Profile Identity Must Be Explicit

The first browser selection used the `noter.guest` Chrome profile. The correct account was in the
`Nicu` profile.

Effect: the provider page appeared signed out and could have caused work in the wrong account.

Required change: show the browser profile name and account identity before a provider action.

### 9. Existing Worker Creation Has a Gap

Samebase can discover and attach an existing Worker. It cannot create the first Worker for an
adopted repository through the same explicit adoption flow.

Effect: an agent needs a browser or provider API side path before Samebase can attach the resource.

Required change: add a create-or-attach Worker choice for existing repositories.

### 10. Auth Setup Guidance Was Stale

The Convex Auth skill pinned `@auth/core@0.37.0`.

Effect: a new migration could install a release before the security fix used by this application.

Required change: keep the compatible auth pair current and require an audit after installation.
Update the source skill, the in-app skill copy, and the exported starter manifest in one change.

### 11. Anonymous Probes Miss Existing Browser State

The first direct route checks passed, but the named browser profile had a rejected saved login that
could not recover.

Effect: an agent can move DNS while an existing operator session is trapped on an error screen.

Required change: make an existing named browser profile part of the cutover gate. Test stored
authentication after the hostname changes and before the monitoring window starts.

## Production Evidence

| Evidence                   | Value                                                                             |
| -------------------------- | --------------------------------------------------------------------------------- |
| Initial merge commit       | `3b6e6f75acf4d9ded9dd7763bb7f4a10aaed2ea9`                                        |
| Recovery merge commit      | `2948c1c8e73a05664f1472377565e1ffb79db04b`                                        |
| Production build           | `6c499f2e-4173-4631-b8d6-20d213adbbf7`                                            |
| Build outcome and duration | passed, 202 seconds                                                               |
| Worker version             | `785ac1b3-71f7-4255-8af5-55be71b10d45`                                            |
| Worker deployment          | `77f95a21-bc06-42c4-ba50-1b5f0ad9966d`, 100%                                      |
| Production upload          | 7,374.54 KiB, 1,432.82 KiB gzip                                                   |
| `workers.dev` URL          | `https://bristol-tsx.pfp.workers.dev`                                             |
| Workers Custom Domain ID   | `fca1043d03b4a8d8d382a561182cf43faabf1a20`                                        |
| Managed DNS record         | AAAA `428fd8b10920aefc03921606a8600ed8`                                           |
| Named browser gate         | `Nicu` profile, saved login stayed valid, app did not show the unavailable screen |
| Netlify build status       | stopped, last deployment still returns 200                                        |
| Repository homepage        | `https://bristol.tsx.md`                                                          |
| Public URL                 | `https://bristol.tsx.md`                                                          |

## Monitoring

Record one row at cutover and one row every five minutes for 30 minutes. For this application, the
recorded warm-route CPU threshold is less than 100 ms. Two consecutive checks at or above 100 ms
require rollback.

| UTC time | URL                      | Safe routes | HTTP 5xx | Worker exceptions | Maximum CPU | Result |
| -------- | ------------------------ | ----------- | -------- | ----------------- | ----------- | ------ |
| 17:45    | `https://bristol.tsx.md` | passed      | 0        | 0                 | 76 ms warm  | passed |
| 17:50    | `https://bristol.tsx.md` | passed      | 0        | 0                 | 6 ms retry  | passed |
| 17:55    | `https://bristol.tsx.md` | passed      | 0        | 0                 | 9 ms retry  | passed |
| 18:00    | `https://bristol.tsx.md` | passed      | 0        | 0                 | 20 ms       | passed |
| 18:05    | `https://bristol.tsx.md` | passed      | 0        | 0                 | 6 ms        | passed |
| 18:10    | `https://bristol.tsx.md` | passed      | 0        | 0                 | 65 ms       | passed |
| 18:15    | `https://bristol.tsx.md` | passed      | 0        | 0                 | 9 ms        | passed |

The complete window contained 284 Worker invocations. Every invocation had outcome `ok`. No HTTP 5xx
status or Worker exception occurred.

The first public 200 request used 255 ms of CPU during Worker and application cold start. The
repeated warm safe-route gate stayed at or below 76 ms.

The 17:50 sample first reported 192 ms for the raw API and 122 ms for the cross-site rejection. The
required immediate route-specific retry measured 3 ms and 6 ms. Later samples filter telemetry by
the exact request URL and status. This prevents unrelated browser or service-worker traffic from
entering the checked route result.

The 17:55 raw API sample first used 206 ms. Its required immediate retry used 9 ms. No checked route
used 100 ms or more in two consecutive checks.

The named `Nicu` browser profile passed saved-session continuity on the public hostname. A fresh
sign-in, one reversible write, and sign-out are an accepted manual follow-up, not a hosting
migration gate. That flow requires operator credentials and a health-data change. The migration used
the existing signed-in session for a read-only continuity check and did not store credentials or
change health data.

## Sources

- [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext Cloudflare guide](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare Workers Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Convex deploy command](https://docs.convex.dev/cli/reference/deploy)
- [Auth.js core 0.41.3 release](https://github.com/nextauthjs/next-auth/releases/tag/%40auth%2Fcore%400.41.3)
- [Samebase agent reference](https://samebase.com/llms.txt)
