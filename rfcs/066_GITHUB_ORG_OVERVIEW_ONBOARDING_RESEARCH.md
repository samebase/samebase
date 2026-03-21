# 066 GitHub Org Overview Onboarding Research

## Document Control

- Status: Research note
- Owner: Noter product/frontend
- Last updated: 2026-03-21
- Depends on: none

## Purpose

Capture what GitHub's organization Overview onboarding module appears to be,
what `https://github.com/features#features-collaboration` currently represents,
and which parts of the experience are documented versus inferred.

This note is intended to keep future Noter product work grounded in what GitHub
actually exposes today instead of relying on memory or UI guesses.

## Research Questions

1. What is `https://github.com/features#features-collaboration`?
2. How does that section relate to the org Overview cards shown in GitHub's
   onboarding UI?
3. Which parts of the org Overview are owner-configurable today?

## Primary Findings

1. `https://github.com/features#features-collaboration` is an anchor inside
   GitHub's main `/features` page, not a separate product surface.
2. As researched on 2026-03-21, the `Collaborative Coding` section on
   `/features` groups these items:
   - GitHub Codespaces
   - GitHub Copilot
   - Pull requests
   - Discussions
   - Code search and code view
   - Code review
   - Draft pull requests
   - Protected branches
3. The org Overview onboarding UI shown in the screenshot appears to reuse that
   same feature taxonomy in a task-oriented form.
4. The screenshot's `Collaborative coding` cards map cleanly to first-party
   GitHub collaboration features:
   - `Create a pull request` maps to pull requests
   - `Create a branch protection rule` maps to protected branches
5. Other screenshot buckets strongly appear to be simplified labels for the
   remaining `/features` sections:
   - `Security` -> `Application security`
   - `Client apps` -> `Client apps`
   - `Project management` -> `Project management`
   - `Team administration` -> `Governance & administration`
   - `Community` -> `Community`
6. GitHub documents how to customize an organization profile with an org
   `README.md` and pinned repositories, but this research did not find
   first-party documentation for configuring the onboarding task cards
   themselves.
7. Secondary evidence indicates owners can hide the onboarding task block from
   the Overview page, but this behavior was not found in current first-party
   documentation and should be treated as UI behavior rather than a documented
   contract.

## Confidence and Evidence

### High-confidence findings

1. The `/features` page itself exposes a `Collaborative Coding` section with the
   current feature list above.
2. Pull requests, code review, draft pull requests, protected branches,
   discussions, code search, and Codespaces are all current GitHub feature
   surfaces with first-party documentation.
3. Organization profiles are officially customizable through profile metadata,
   pinned repositories, and org profile `README.md` content.

### Inferences

1. The org Overview onboarding UI likely uses GitHub's public feature taxonomy
   as its information architecture.
2. The `See more about collaborative coding` link in the screenshot likely
   points to `/features#features-collaboration` or an equivalent marketing
   destination.
3. `Team administration` is likely GitHub's friendlier label for the
   `Governance & administration` bucket on `/features`.

## Mapping Table

| GitHub org Overview UI            | Likely underlying GitHub feature bucket | Basis                           |
| --------------------------------- | --------------------------------------- | ------------------------------- |
| Invite your first member          | Governance/admin onboarding             | org-owner setup task            |
| Customize members' permissions    | Governance/admin onboarding             | org permissions task            |
| Create a pull request             | Collaborative Coding                    | exact product match             |
| Create a branch protection rule   | Collaborative Coding                    | exact product match             |
| Auto-assign new issues            | Automation and CI/CD                    | GitHub Actions automation task  |
| Run a continuous integration test | Automation and CI/CD                    | GitHub Actions workflow task    |
| Security                          | Application security                    | naming overlap                  |
| Client apps                       | Client apps                             | exact label match               |
| Project management                | Project management                      | exact label match               |
| Team administration               | Governance & administration             | naming simplification inference |
| Community                         | Community                               | exact label match               |

## What GitHub Officially Documents Today

1. GitHub's feature taxonomy:
   - `/features` contains the current `Collaborative Coding`,
     `Automation and CI/CD`, `Application security`, `Client apps`,
     `Project management`, `Governance & administration`, and `Community`
     sections.
2. Collaboration primitives:
   - pull requests and pull request reviews
   - draft pull requests
   - protected branches / branch protection rules
   - repository or organization discussions
   - code search
   - Codespaces
3. Organization profile customization:
   - org profile metadata
   - public/member README content
   - pinned repositories

## What This Research Did Not Confirm

1. A documented owner setting for editing, ordering, or replacing the Overview
   onboarding task cards.
2. A documented API or config surface for that onboarding module.
3. A first-party doc that explicitly says the Overview cards are powered by the
   `/features` taxonomy, even though the naming overlap is strong.

## Product Implications for Noter

1. If Noter references GitHub's org Overview UX, we should treat the onboarding
   cards as GitHub-managed UI rather than as a stable, configurable contract.
2. If we want an org-overview-like experience inside Noter, we should own our
   own information architecture instead of cloning GitHub's buckets too
   literally.
3. If we need a durable place to orient users inside a GitHub org, the stable
   first-party surfaces are:
   - org profile `README.md`
   - pinned repositories
   - repository/org discussions
   - branch protection and PR workflows
4. If future product work depends on controlling GitHub's Overview layout, we
   should assume that is not currently supported until a first-party doc proves
   otherwise.

## Recommended Next Steps

1. If this research is needed for user-facing product decisions, preserve the
   distinction between documented facts and UI inferences in any follow-up spec.
2. If we need stronger confirmation about the hide/show task behavior, verify it
   manually in a test organization and treat the result as operational knowledge
   rather than API contract.
3. If we plan to use GitHub org profiles as an onboarding surface, prototype
   around org `README.md` plus pinned repos, since those are the documented
   customization levers.

## Source Links

### Primary sources

1. GitHub Features: <https://github.com/features#features-collaboration>
2. Pull requests docs: <https://docs.github.com/en/pull-requests>
3. About pull request reviews:
   <https://docs.github.com/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews>
4. Managing protected branches:
   <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches>
5. GitHub code search syntax:
   <https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax>
6. Enabling or disabling GitHub Discussions for a repository:
   <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/enabling-or-disabling-github-discussions-for-a-repository>
7. Enabling or disabling GitHub Codespaces for your organization:
   <https://docs.github.com/enterprise-cloud@latest/codespaces/managing-codespaces-for-your-organization/enabling-or-disabling-github-codespaces-for-your-organization>
8. Your organization's profile:
   <https://docs.github.com/en/account-and-profile/concepts/organization-profile>
9. About your organization's profile:
   <https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/about-your-organizations-profile>

### Secondary source

1. Stack Overflow discussion about hiding the onboarding task module:
   <https://stackoverflow.com/questions/73337205/github-organisation-overview-tab-how-to-display-list-of-repositories>
