# Public repository readiness, 2026-10-30

Scope: the `samebase/samebase` repository at `3607ccf12`, including the root-cleanup changes in
[PR 1812](https://github.com/samebase/samebase/pull/1812). Two read-only reviews covered contributor
setup and publication exposure. The main review checked product claims against the source.

This is a publication review, not a full application-security audit. No production data was read,
and repository visibility was not changed.

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

GitHub retains 90 days of Actions logs. The artifact inventory contained 26 unexpired artifacts,
mostly Playwright failure reports and three SARIF reports. A redacted pattern scan of two recent
production deployment logs and the PR 1812 deployment log covered about 252 KB and found no
recognizable tokens or private keys. This does not cover all retained logs or prove that logs
contain no sensitive data.

[GitHub's visibility documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
states that Actions history and logs become public. Review retained output before changing
visibility. No workflow runs, artifacts, or Git history were deleted by this review.

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

## Scope limits

This review did not repeat the earlier full notes/media screening, scan every Git-history blob, scan
every retained Actions log, audit application authorization, or validate independent hosting. The
remaining tasks are tracked in the [publication checklist](../docs/public-launch-checklist.md).
