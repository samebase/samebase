# 098 Provider Setup Display And Write Safety History

## Document Control

- Status: Implemented
- Owner: vault provider setup, provider settings, and provider write safety
- Created: 2026-07-29
- Implemented: 2026-07-29
- Archived: 2026-07-29
- Current contracts:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`

## Historical Note

This document keeps the evidence that caused the change. It is not active product guidance. The
current contracts are in the specs above, with code and tests as the first authority.

The implemented direction kept Overview and Settings available, showed planned provider resources,
used one vault-level infrastructure operation gate in the backend, and made one fresh provider read
after a known write. Manual write recovery uses one leased attempt and one exact Retry action. The
write-lock table moved directly to its final schema because deployment requires the table to be
empty. There is no compatibility or migration path.

## Evidence

A local New App test on 2026-07-29 showed this sequence:

1. Overview opened about 1.6 seconds after submit.
2. Settings opened about 0.9 seconds later.
3. Settings showed no provider resources for about 6 seconds.
4. The first Convex row used a provider ID instead of a readable project name.
5. The Cloudflare row showed attention while the managed workflow still changed it.
6. The false attention state stayed for about 50 seconds.
7. The next 60-second provider read showed the correct state without a page reload.

The workflow was correct. The dashboard did not show the plan. After completion, the dashboard used
provider data that was older than the workflow.
