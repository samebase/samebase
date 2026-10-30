# Public repository readiness, 2026-10-30

Scope: the `samebase/samebase` repository at `3607ccf12`, including the root-cleanup changes in
[PR 1812](https://github.com/samebase/samebase/pull/1812). Three read-only agents reviewed
contributor setup, publication exposure, and retained CI artifacts. The main review checked product
claims against the source. The documentation changes continue in
[PR 1813](https://github.com/samebase/samebase/pull/1813), based on `6d341a71e` after PR 1812
merged.

This is a publication review, not a full application-security audit. No production database was
queried, and repository visibility was not changed.

## Product and documentation

The product is app setup and management through an MCP server and a dashboard. The collaborative
file editor is currently staff-only. Ordinary members lack `access_files_read` and
`access_files_write` in [the role grants](../apps/samebase/shared/accessModel.ts#L54), and
[file staging](../apps/samebase/convex/fileStaging.ts#L42) checks those permissions.

The documentation patch:

- Replaces the README's editor description and July capability list with current product behavior.
- Separates the Samebase service, which uses Convex hosting, from the Worker-based app starter.
- Adds contributor and private security-reporting entry points.
- Moves maintainer deployment and sign-in instructions to a linked development runbook.
- Removes the claim that the app is closed source from the homepage FAQ and the generator of
  `llms.txt`. The root license is already AGPL-3.0-only.
- Corrects the stack guide's claim that the service runs as three Cloudflare Workers.
- Replaces the missing `.node-version` reference with the actual Node and pnpm requirements.

Historical research and archived plans remain historical. They were not rewritten to describe the
current product. `samebase.md` and `.devcontainer/` stay, as requested.

## Contributor setup still needs engineering work

An outside contributor cannot follow the old README's normal startup with only a clone and a new
Convex account:

| Path             | Existing dependency                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary checkout | `apps/samebase/scripts/predev.ts:126` runs `hub:client`; `apps/samebase/package.json:23` names the maintainer's Convex team and hub app                        |
| Linked worktree  | `scripts/run-worktree-dev.ts:203` validates a configured source deployment; `scripts/worktree-env-allowlist.ts` requires GitHub App credentials and seed facts |
| Commit hook      | `.vite-hooks/pre-commit` runs the full app typecheck, which expects generated modules from the app setup                                                       |

CI already has a local bootstrap in `scripts/ci-bootstrap-convex.ts:82` that generates keys and uses
placeholder provider settings. Use that existing mechanism as the basis for a supported contributor
startup. Verify it in a fresh checkout without a maintainer login before promising one-command
development. This review did not run that clean-checkout experiment or change startup code.

The current patch documents these limits. Publishing the source does not need to wait for a complete
self-hosting installer.

## Publication exposure

GitHub secret scanning and push protection are enabled. Repository workflow defaults are read-only,
and workflows cannot approve pull-request reviews.

Secret-scanning alert 1 identified a webhook signing value in
`apps/samebase/convex/polarWebhooks.convex.test.ts`. The test uses it to construct a signer and
stubs `POLAR_WEBHOOK_SECRET`. Its decoded value identifies itself as test data. This is evidence of
a fixture, not a confirmed credential leak. The alert was resolved as `used_in_tests`, and the saved
resolution was read back. Secret scanning and push protection remain enabled.

The earlier media review covered nine LFS video recordings and 19 ordinary Git video blobs with
sampled frames, contact sheets, OCR, and inspection of flagged frames. Its audio check used
transcripts. It did not listen to the camera audio or the four tracked MP3 files. This review found
no new evidence that requires repeating that work. LFS download exclusions and an
all-rights-reserved license do not make files private after publication.

### Retained Actions logs

The follow-up review replaced the earlier three-log sample with an inventory of 3,466 workflow runs
and all 3,503 attempts created from August 1 through October 30 at 20:54:32 Europe/Chisinau. The
repository's log retention setting is 90 days. Date-split pagination avoided GitHub's filtered-query
result cap, and each rerun attempt was requested separately. A further 1,208 July runs were checked
for reruns crossing into the retention window; none did.

- Readable logs covered 3,163 attempts, including all 522 current and retired deployment attempts.
  Seven attempts were recovered through individual job downloads after whole-archive requests
  failed.
- The scan read 38,414 log entries, about 1.89 GB of unpacked text and 17.68 million lines. These
  totals include repeated output in job and step logs.
- Seven archives were verified as empty ZIP files. Another 333 attempts returned unavailable logs:
  300 returned HTTP 404 and 33 returned HTTP 410. Samples from both groups also failed through the
  default run-log endpoint. They are recorded as unavailable, not scanned.
- Every inventoried attempt has a recorded outcome. There were no unresolved download or parsing
  errors after recovery.

The scan used [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
downloaded from the official release and checked against its published checksum. It used the default
rules, full report redaction, and decoding up to three levels. Separate checks covered Convex
deployment keys, credential environment assignments and JSON fields, authorization headers,
credential URLs, keyrings, private-key markers, JWTs, cookies, and email addresses. Positive
controls verified plain and encoded credential detection; masked-value controls and report redaction
also passed. Historical workflow definitions were reviewed to identify deployment, drift, preview
seeding, and repository-export steps that handle credentials.

Gitleaks reported 86 matches: 71 occurrences of the public `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and
15 Git commit hashes matched by its legacy Sourcegraph-token rule. The hashes were checked against
the log's checkout, action-download, runner-version, and source-commit output.

The only token value identified was the public PostHog project token. The value has the browser
project-token format and is passed to the browser SDK in `apps/samebase/src/lib/posthogClient.ts`.
[PostHog documents](https://posthog.com/docs/api) this token for public ingestion and flag requests;
private API access uses separate authentication. No private provider token, deploy key, private key,
or session credential was confirmed in the inspected logs.

Email matches were seeded test accounts, the maintainer's seeded address already present in source
and commit metadata, example addresses, and public contact addresses. Runner SSH destinations and
package paths produced additional email-pattern matches. Cookie-pattern matches came from the
`cookie` dependency in printed lockfile text. No new private customer address was identified.

This check found no additional reason to delay publication or rotate a credential. It covers the
available text at the inventory cutoff, not future workflow output or every possible secret format.
Raw local downloads were removed after verification; the report contains no credential values.

### Retained Actions artifacts

The artifact review covered all 26 retained archives: 23 Playwright reports and three SARIF reports.
It read 1,231 text entries, including nested trace archives and embedded reports, and 8,138 network
events. It found no recognized provider keys or private keys. All 632 requests carrying credentials
went to localhost. The captured JWTs had local CI issuers and expired on October 29. Email matches
were test or example addresses, or the published Samebase contact.

The artifact review completed on October 30 at 20:45 Europe/Chisinau. Raw downloads were removed.
Screenshot pixels were not inspected, and pattern matching cannot rule out every secret format.

[GitHub's visibility documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
states that Actions history and logs become public. The available text review is complete within the
limits above. No workflow runs, artifacts, or Git history were deleted by this review.

## After publication

- Enable and verify
  [private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
  GitHub documents that feature for public repositories. The new root `SECURITY.md` uses the
  existing `contact@samebase.com` channel in the meantime.
- Verify approval rules for outside contributors and run one real fork pull request through CI.
  `.github/workflows/alchemy.yml:53` already excludes fork deployments, and CI uses an anonymous
  local Convex backend. The public-fork approval API could not be read while the repo was private.
- Check the active branch rules again after the visibility change. A passing internal PR does not
  prove that all settings and third-party runners work for public forks.
- Check the README, license links, deployed FAQ, and generated agent documentation without a
  maintainer login.

The repository About description was changed from "GitHub-backed workspace for notes, code, and AI"
to "Set up and manage web apps in your GitHub, Convex, and Cloudflare accounts, through coding
agents and a dashboard." The saved description was read back, and visibility remains private.

## Validation of the documentation patch

- The existing landing and documentation component tests passed: 12 tests.
- The app TypeScript check passed.
- The contributor guide's `pnpm --filter @samebase/dependent check` passed types, lint, and 20
  tests.
- Regenerated the action docs and passed `verify:action-docs`.
- Checked 41 relative links in seven entry-point and review documents; no missing targets.
- Vite+ formatting and `git diff --check` passed. Local checks used Node 26.13.0 and pnpm 12.14.0;
  PR CI uses Node 24. This was not a fresh-machine installation test.

## Scope limits

This review did not repeat the earlier full notes/media screening, scan every Git-history blob,
inspect artifact screenshot pixels, audit application authorization, or validate independent
hosting. Unavailable log attempts and runs after the inventory cutoff were outside the text scan.
The remaining tasks are tracked in the [publication checklist](../docs/public-launch-checklist.md).
