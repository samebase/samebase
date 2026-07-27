# Vault Pull Request Filters Spec

## Document Control

- Status: Dormant, retained for possible reactivation
- Owner: Samebase dashboard/frontend
- Last updated: 2026-07-26
- Related spec: [Pull request provider query](../specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md)

## Historical Contract

The vault dashboard saved per-user, per-vault presentation preferences for its live pull request
list. Filters applied in the browser to GitHub pages already loaded. They were never sent to the
provider action and never caused a server-side repository scan.

The UI was inclusive:

- all labels started selected;
- `No label` started selected;
- draft pull requests were excluded by default;
- clearing a label hid pull requests carrying that label;
- clearing `No label` hid unlabeled pull requests.

The current vault overview does not mount this filter UI and does not apply saved filter
preferences. The schema, API, and helper code remain dormant so this feature can be reconsidered
without treating this historical behavior as the current product contract.

## Persistence

`ui_vaultPullRequests_filters` stores one row per `(userId, vaultId)` with required fields:

- `hiddenLabels: string[]`
- `includeDrafts: boolean`
- `includeNoLabel: boolean`

There is no compatibility interpretation for rows missing `includeNoLabel`.

## Historical Filtering Rules

For one loaded pull request:

1. hide it when it is a draft and `includeDrafts` is false;
2. if it has no labels, show it only when `includeNoLabel` is true;
3. if it has labels, hide it when any label appears in `hiddenLabels`;
4. otherwise show it.

Filter options were derived from all pull requests currently loaded, not only the filtered result.
Labels were sorted deterministically.

When no loaded row matched but GitHub reported another page, the UI kept its automatic pagination
sentinel active.

## Historical Validation

- Filter state persisted per user and vault.
- `includeNoLabel` was required at every schema, mutation, and test boundary.
- Provider action arguments contained no filter state.
- Toggling filters did not refetch GitHub.
- A filtered-empty page continued provider pagination automatically.

## Non-Goals

- GitHub search syntax
- Server-side filtering
- Cross-vault global filters
- Author, assignee, or review-state filters
