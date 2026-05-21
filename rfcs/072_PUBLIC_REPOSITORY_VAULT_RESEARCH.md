# 072 Public Repository Vault Research

## Document Control

- Status: Research note
- Owner: Noter product/backend
- Last updated: 2026-03-29
- Depends on:
  - `apps/noter/convex/vaultActions.ts`
  - `apps/noter/convex/fileStagingActions.ts`
  - `apps/noter/convex/github.ts`
  - `apps/noter/convex/codespaces.ts`
  - `apps/noter/convex/schema.ts`
  - `apps/noter/src/components/AddRepository.tsx`

## Purpose

Capture what Noter would need in order to let a user create a vault from any public GitHub
repository, in two product models:

1. Noter auto-creates a GitHub fork for the user and uses that fork as the writable vault
   repository.
2. The public repository stays the vault source of truth and write/publish behavior is handled
   separately in Noter.

This is a research draft, not an accepted implementation plan.

## Research Questions

1. What already works today for public repositories?
2. What currently blocks the UX for "any public repo" vault creation?
3. Which existing flows assume the connected repository is writable?
4. What would an auto-fork model require?
5. What would a Noter-handled model require?
6. Which direction is the smallest extension of today's architecture?

## Current Noter State

### What already works

`vaultActions.connectRepository` already accepts an arbitrary `repositoryFullName`, fetches the
repo, default branch, and tree from GitHub, and inserts a vault with `isNoterManaged: false`.

There is no existing owner/collaborator/write-permission check in that backend path. If the
authenticated GitHub token can read the repository, the action can connect it.

That means the backend is already close to supporting public repositories by name.

### What blocks the current UX

The add-vault UI does not let the user enter an arbitrary `owner/repo`. `AddRepository.tsx` only
shows repositories discovered through `github.listRepositoriesPreview` and
`github.listRepositories`.

Those discovery actions currently call:

- `GET /user/repos`
- with `affiliation=owner,collaborator,organization_member`

So public repositories outside the user's existing affiliations do not appear in the picker even
though `connectRepository` itself could connect them.

### Current OAuth scope state

`githubOAuth.ts` currently requests:

- `repo`
- `delete_repo`
- `user`
- `user:email`
- `codespace`
- `read:packages`

That means GitHub auth scope is not the main blocker for either:

- creating a fork, or
- creating a codespace

The current app already asks for enough GitHub permission to do both. If Noter ever wants a
lower-privilege public-only connect mode, that would be a separate product/auth decision.

### Current vault model limitations

The `vaults` table stores one GitHub repository identity:

- `ghRepoId`
- `ghRepoOwner`
- `ghRepoName`

It does not distinguish:

- source/upstream repository
- working repository
- writable versus read-only repository mode
- fork-backed versus directly connected repository

`isNoterManaged` is also too coarse for this problem. Today it mostly means "Noter created and
seeds/provisions this repo," not "this vault is writable."

### Current write-path assumptions

Most of the shipped editing/publish flow assumes the vault repository itself is the writable GitHub
remote:

- commits update `refs/heads/<branch>` directly with `git.createTree`, `git.createCommit`, and
  `git.updateRef`
- draft PR creation calls `pulls.create` against the vault repository
- draft branch creation calls `git.createRef` against the vault repository
- codespaces are created against `vault.ghRepoId`

That is a good fit for owned/collaborator repos and for Noter-created repos. It is not a good fit
for a public upstream repo that the user can only read.

### Current PR sync assumptions

`github.ts` currently lists open pull requests on the vault repository and only attaches PRs whose
`head.repo.full_name` matches the vault repository.

That is correct for today's same-repo branch model, but it is not enough for a fork-backed working
model where:

- the working branch lives in the fork
- the PR record lives in the upstream repository

### Current lifecycle assumptions

`addVault` deduplicates per user by `ghRepoId`. That matters because a future "convert this
public-source vault into a fork-backed vault" flow cannot simply swap from upstream repo id to fork
repo id without either:

- mutating the vault identity, or
- introducing separate source/working repo fields

Delete behavior also assumes only `isNoterManaged` vaults may delete their GitHub repo. That is not
the right model for a user-owned fork that Noter did not originally seed.

## External GitHub Research

As checked on 2026-03-29 in GitHub's current docs:

- [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps):
  - no scope gives read-only access to public repository information
  - `public_repo` gives read/write access to public repositories
  - `repo` gives full public/private repository access
  - `codespace` allows creating and managing codespaces
- [About permissions and visibility of forks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-permissions-and-visibility-of-forks):
  - users can fork any public repository to a personal account
  - public forks do not inherit the upstream permissions structure
- [REST API: Create a fork](https://docs.github.com/en/rest/repos/forks):
  - `POST /repos/{owner}/{repo}/forks`
  - returns `202 Accepted`
  - supports `name` and `default_branch_only`
- [Creating a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request):
  - anyone with read access can create a PR
  - if you do not have write permission to the repository, you can fork first
  - for public repos, you need write access to the head/source branch in order to open the PR
- [REST API: Create a codespace in a repository](https://docs.github.com/en/rest/codespaces/codespaces):
  - `POST /repos/{owner}/{repo}/codespaces`
  - OAuth app tokens need the `codespace` scope
- [Managing repository access for your codespaces](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-repository-access-for-your-codespaces):
  - if you create a codespace for a repo where you only have read access, then commit or push a new
    branch, GitHub Codespaces automatically links that codespace to a new or existing fork and
    upgrades the token to read/write on the fork

Two important consequences fall out of that:

1. GitHub already has a native "create or attach a fork when the user first writes from a read-only
   codespace" behavior.
2. Noter still needs a writable head repository somewhere if it wants to keep the existing GitHub
   branch/commit/PR UX.

## Key Findings

1. The smallest missing piece for "connect any public repo" is not the backend. It is discovery and
   product-mode handling.
2. A plain public read-only vault is already near-term feasible if the UI adds a direct `owner/repo`
   entry path and replaces write affordances with one explicit transition action such as
   `Fork to edit`.
3. A full "works like today's connected repos" experience still needs a writable GitHub repository.
   In practice that means:
   - a fork, or
   - a separate publish target repo
4. The current schema should not overload `isNoterManaged` to represent this. The repo relationship
   needs richer modeling.
5. Auto-fork is the smaller extension if the goal is "public repo vaults with today's
   commit/branch/PR model."
6. "Handled in Noter" is viable only if the product accepts a distinct read-only source model and a
   separate publish step.
7. In source-only mode, a single `Fork to edit` CTA is clearer than exposing `Commit`,
   `Draft branch`, or `Draft PR` actions that cannot complete yet.

## Option A: Auto-Create a Fork for the User

### Product model

The user chooses a public upstream repo. Noter creates or reuses a fork in the user's account, and
the vault works against that fork as the writable repository.

The upstream repo remains important metadata because PRs target upstream, but the working Git refs
live in the fork.

### Why this fits today's code better

This preserves most current assumptions:

- staged commits still write to a GitHub branch
- draft PRs still come from a GitHub branch
- codespaces can still be created on the writable repo
- file staging rebases still compare against a real remote branch

Most of the existing write implementation can stay intact if the writable repo is the fork.

### Backend changes required

1. Add a new action or extend `connectRepository` with a public-repo mode that:
   - validates the upstream repo is public
   - creates or locates the user's fork
   - waits for the fork to become readable
   - creates the vault against the fork repo, not the upstream repo
2. Handle the fork endpoint's async behavior (`202 Accepted`) by polling `repos.get`,
   `repos.getBranch`, and `git.getTree` until the fork is ready.
3. Add explicit vault repo relationship fields instead of relying on the single `ghRepo*` identity.

Suggested shape:

- `repositoryMode: "noter_managed" | "connected_direct" | "fork_backed"`
- `sourceRepoId/sourceRepoOwner/sourceRepoName`
- `workingRepoId/workingRepoOwner/workingRepoName`
- `pullRequestBaseRepoId/pullRequestBaseRepoOwner/pullRequestBaseRepoName`

Even if the exact names change, Noter needs the concept split.

4. Update delete flow so fork-backed vaults can optionally delete the user-owned fork without
   pretending the vault is `isNoterManaged`.
5. Decide whether multiple upstream public repos should be allowed to map to separate fork-backed
   vaults even when the user already connected the upstream directly. Current dedupe by `ghRepoId`
   is insufficient for that migration.
6. Keep fork-backed vaults out of the current `createRepository` path unless the product
   intentionally wants starter seeding, Pro gating, and automatic infra provisioning. The existing
   `createRepository` flow is for Noter-created projects, not for connected public-source repos.

### PR and branch sync changes required

This is the biggest hidden backend delta.

Today PR sync assumes:

- list PRs on the vault repo
- branch belongs to the vault repo
- PR head repo equals the vault repo

For a fork-backed vault, the correct model becomes:

- branches come from the fork repo
- pull requests are listed from the upstream/base repo
- PR matching uses `head.repo == fork repo` and `head.ref == branch`

Without this, the dashboard will show branches but miss the upstream PRs that matter to the user.

### Codespaces changes required

Noter can keep creating codespaces against the working repo if the working repo is the fork. That is
the simplest continuation of today's logic.

If Noter instead creates the codespace against the upstream repo and lets GitHub auto-link the fork
later, then Noter must discover and persist that fork transition. The current schema and codespace
flow do not track that.

### UI changes required

1. Add direct public repo entry in `AddRepository`.
2. Show both identities when useful:
   - working repo: fork
   - upstream repo: PR target / source
3. If the vault starts in a source-only public mode before a fork exists, replace write actions with
   a single `Fork to edit` CTA that either:
   - creates a fork, or
   - reuses an existing fork and attaches the vault to it
4. Decide which repo name is primary in routes and headings.

If the route keeps using `workingRepoOwner/workingRepoName`, the app will feel fork-centric. If it
shows upstream branding, the app needs a separate display identity from the working repo identity.

### Pros

- closest to today's architecture
- preserves current commit/branch/PR mental model
- easiest to keep GitHub-native flows working
- easiest to keep codespaces behavior consistent

### Cons

- creates extra GitHub resources up front
- requires a real fork relationship model in schema/UI
- PR sync must become upstream-aware
- delete lifecycle becomes more nuanced

## Option B: Keep the Public Repo as Source and Handle Publish in Noter

### Product model

The vault stays attached to the public upstream repository as a read-only source repository. Edits
live in Noter state until the user explicitly chooses a publish/export path.

This is not just "Option A later." It is a different model:

- source repository
- Noter working state
- optional later publish target

### What this means in practice

Reading already fits fairly well:

- fetch trees from upstream
- fetch file contents from upstream
- stage edits locally in Noter

Publishing does not fit the current architecture:

- current commit flow writes directly to the vault repo
- current draft PR flow assumes a writable GitHub head branch already exists
- current codespace flow assumes the vault repo is the repo to open in Codespaces

So this option requires Noter to stop treating "vault repo" and "publish repo" as the same thing.

### Backend changes required

1. Add a read-only or source-only vault mode.
2. Gate all direct GitHub write operations behind a publish target check.
3. Introduce a separate publish target model, for example:
   - fork created later
   - new repository created later
   - exported patch/archive only
4. Split branch concepts:
   - upstream branches
   - Noter-only draft branches
   - publish branches once a target exists
5. Rework commit approval and draft PR tools so they do not promise an immediate GitHub branch
   update when no writable target exists.

### Codespaces implications

There is one important hybrid here:

GitHub Codespaces can start from a read-only public repo and auto-link to a new or existing fork on
first commit/push.

That means Noter could theoretically:

1. create a vault directly on the public repo
2. create a codespace on that public repo
3. let GitHub create/reuse the fork later when the user first writes
4. then reconcile Noter's vault/publish model with the new fork

That is promising, but it is not "all in Noter." GitHub still performs the fork transition, and
Noter would need a new reconciliation flow to detect and adopt the writable fork identity after the
fact.

### UI changes required

1. Make the read-only state explicit.
2. Replace `Commit`, `Draft branch`, and `Draft PR` with a single `Fork to edit` button until a
   writable publish target exists.
3. Make the button semantics explicit:
   - if no fork exists, create one
   - if a usable fork already exists, attach/reuse it
4. Explain the transition from:
   - source repo
   - to writable publish target

Without that, the current UI will feel broken because commit/PR actions will fail late with
permission errors.

### Pros

- best fit for "inspect any public repo" with minimal upfront GitHub mutation
- supports a true read-only exploration mode
- does not force a fork at vault-creation time

### Cons

- substantially larger product/model change
- current write pipeline cannot be reused as-is
- still needs a writable target eventually for GitHub PRs
- introduces dual branch/repo identity throughout the app

## Recommendation

If the goal is:

- "any public repo should work with today's branch/commit/PR experience"

then auto-fork is the better fit.

If the goal is:

- "let me inspect and edit any public repo with the least upfront ceremony"

then a read-only public-source vault is the right first step, but it should be treated as a distinct
product mode and not as a small tweak to today's writable vault model. In that mode, the clearest UI
is a single `Fork to edit` CTA rather than renamed variants of commit/PR actions.

## Recommended Rollout Shape

### Phase 1: Smallest useful unlock

Ship direct public repo connection first:

1. Add an `owner/repo` input in `AddRepository`.
2. Reuse the existing `connectRepository` backend.
3. Add a vault-level repo access mode.
4. In source-only public mode, hide write actions and show one `Fork to edit` button instead.
5. Make that button create or reuse a fork, then move the vault into the normal writable flow.

This alone unlocks "create a vault from any public repo" for read/search/edit exploration.

### Phase 2A: Preferred path for full GitHub-native editing

Add fork-backed publish support:

1. Create or reuse fork
2. Persist source/work/base repo identities
3. Move writable operations to the fork
4. Move PR sync to upstream-aware matching

This is the recommended full-feature path.

### Phase 2B: Alternative path

If the product strongly prefers not to fork up front, build a source-only vault mode with lazy
publish-target creation later. That is viable, but it should be treated as a larger architecture
feature, not a small extension.

## Suggested Next Decision

Decide which product promise matters more:

1. "Any public repo, but initially read-only/source-only"
2. "Any public repo, and it behaves like a normal writable vault right away"

If the answer is `2`, the implementation should be planned around fork-backed vaults rather than
trying to hide the fork behind the existing single-repo model.
