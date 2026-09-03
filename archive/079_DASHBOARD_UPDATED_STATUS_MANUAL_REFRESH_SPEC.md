# Dashboard Updated Status Manual Refresh Spec

## Document Control

- Status: Superseded by `archive/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
- Owner: Noter dashboard + GitHub sync flows
- Last updated: 2026-05-12
- Related specs:
  - `archive/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
  - `archive/070_GITHUB_SYNC_PHASED_ROLLOUT_SPEC.md`
  - `specs/045_REPOSITORY_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`

## Supersession

This old action-backed dashboard click plan was replaced by spec `099`.

Current contract:

- dashboard status clicks enqueue repository refresh demand through
  `api.repositoryRefresh.enqueueManualRepositoryRefresh`
- React does not call GitHub refresh actions for dashboard freshness
- React does not choose metadata depth, provider-link hydration, debounce, batching, or vault
  fan-out
- text selection still suppresses accidental click refresh
