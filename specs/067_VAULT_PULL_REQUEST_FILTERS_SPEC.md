# Vault Pull Request Filters Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase dashboard/frontend
- Last updated: 2026-07-21
- Related spec: [Pull request provider query](./115_PULL_REQUEST_PROVIDER_QUERY_SPEC.md)

## Current Contract

The vault dashboard saves per-user, per-vault presentation preferences for its live pull request
list. Filters apply in the browser to GitHub pages already loaded. They are never sent to the
provider action and never cause a server-side repository scan.

The UI is inclusive:

- all labels start selected;
- `No label` starts selected;
- draft pull requests are excluded by default;
- clearing a label hides pull requests carrying that label;
- clearing `No label` hides unlabeled pull requests.

## Persistence

`ui_vaultPullRequests_filters` stores one row per `(userId, vaultId)` with required fields:

- `hiddenLabels: string[]`
- `includeDrafts: boolean`
- `includeNoLabel: boolean`

There is no compatibility interpretation for rows missing `includeNoLabel`. Old rows may be deleted
when the required schema is deployed.

## Filtering Rules

For one loaded pull request:

1. hide it when it is a draft and `includeDrafts` is false;
2. if it has no labels, show it only when `includeNoLabel` is true;
3. if it has labels, hide it when any label appears in `hiddenLabels`;
4. otherwise show it.

Filter options are derived from all pull requests currently loaded, not only the filtered result.
Labels are sorted deterministically.

When no loaded row matches but GitHub reports another page, the UI states that no matching pull
requests are loaded and keeps `Load more` available. It must not claim the complete provider result
is empty.

## Validation

- Filter state persists per user and vault.
- `includeNoLabel` is required at every schema, mutation, and test boundary.
- Provider action arguments contain no filter state.
- Toggling filters does not refetch GitHub.
- A filtered-empty page preserves provider pagination.

## Non-Goals

- GitHub search syntax
- Server-side filtering
- Cross-vault global filters
- Author, assignee, or review-state filters
