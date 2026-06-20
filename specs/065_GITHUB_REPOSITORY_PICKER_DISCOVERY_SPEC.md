# 065 GitHub Repository Picker Discovery Spec

## Document Control

- Status: Implemented
- Owner: Vault add flow + GitHub integration
- Last updated: 2026-03-20
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`

## Summary

The `/add` route must let a connected GitHub user discover any repository that Noter can connect on
their behalf, including repositories that were moved from a personal account into an organization
the user controls.

Two concrete requirements define that behavior:

1. `github.listRepositories` must enumerate the full accessible repository set, not just the first
   GitHub results page.
2. The add-repository search UI must match repository name, owner slug, and full `owner/repo`
   identifier, so an ownership transfer does not make the repo appear missing.

## Problem Statement

Before this change:

1. `github.listRepositories` fetched a single `GET /user/repos` page with `per_page=100`, so users
   with more than 100 accessible repositories could never discover repos beyond page 1.
2. `AddRepository` only searched `repo.name`, so a repo transfer that changed only the owner slug
   made the repo unsearchable by its new organization name.

That combination made transferred org-owned repositories look absent even when GitHub would allow
Noter to connect them.

## Source Of Truth Files

- `apps/samebase/convex/github.ts`
- `apps/samebase/src/components/AddRepository.tsx`
- `apps/samebase/src/lib/repositorySearch.ts`

## Runtime Contract

### Backend repository discovery

`github.listRepositories` is the single source of truth for the raw candidate repository list shown
on `/add`.

Behavior:

1. Read the connected GitHub OAuth token from `providerConnections`.
2. Call GitHub `GET /user/repos` with `affiliation=owner,collaborator,organization_member`.
3. Follow pagination until GitHub no longer returns `rel="next"` in the `Link` header.
4. Normalize each repository to the existing `githubRepositoryListItem` contract.
5. Deduplicate by GitHub repository id before returning the final list.

Result:

- Users can discover repos they own personally, collaborate on, or access via org membership, even
  when those repos fall beyond the first 100 results.

### Frontend search behavior

`AddRepository` performs client-side filtering over the backend result set.

Search must fuzzy-match across:

1. `repo.name`
2. repository owner slug (derived from `repo.full_name`)
3. full `repo.full_name`

The UI continues to hide repositories already connected as vaults by exact `repositoryFullName`
match.

## Non-Goals

1. Server-side search queries to GitHub while typing
2. Bypassing GitHub org approval, SSO, or third-party app restrictions
3. Changing the connect flow after a repository is selected

## External Constraint

Noter currently connects to GitHub with an OAuth app, not a GitHub App.

When a repository belongs to a private organization with OAuth app access restrictions enabled,
repository discovery is still gated by GitHub's org-level approval model:

1. Unapproved OAuth apps cannot access the organization's private resources.
2. Organization owners approve pending requests from the org's OAuth app policy settings.
3. Organization members, and outside collaborators when the org enables access requests for them,
   can request approval from their Authorized OAuth Apps page.
4. Non-owners may still need an organization owner to approve Noter directly, depending on the org's
   request policy.
5. Reconnecting the personal GitHub account does not override that org policy.
6. The `/add` UI should surface a short note for both owner and non-owner recovery paths instead of
   failing silently.

## Acceptance Checklist

- [x] A repo transferred from `user/repo` to `org/repo` can be found by typing `org`.
- [x] A user with more than 100 accessible repositories can still discover repos beyond the first
      GitHub page.
- [x] Existing connected vaults remain filtered out from `/add`.
