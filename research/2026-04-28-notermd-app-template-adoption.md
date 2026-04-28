# notermd/app starter adoption research

Date: 2026-04-28 Status: Research

## Question

Noter currently keeps starter source in `apps/noter-starter-template`, but the
desired starter source is `https://github.com/notermd/app`.

This research answers:

- how the current local starter is wired into Noter,
- how to test the local starter and the external app locally,
- what should change before `notermd/app` becomes the canonical starter source.

## Current Noter Contract

Accepted behavior currently lives in
`specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`. Iteration 1 deliberately kept the
starter in `apps/noter-starter-template`, exported it into
`apps/noter/convex/starterSeedManifest.generated.ts`, and seeded new
repositories as one commit.

The runtime path today is:

1. `apps/noter-starter-template/scripts/export-template-manifest.ts` walks the
   local template directory and writes the generated Convex manifest.
2. `apps/noter/convex/starterSeed.ts` turns that manifest into a deterministic
   Git tree and root commit.
3. `apps/noter/convex/vaultActions.ts` creates the GitHub repository, calls the
   starter seeder, then records the vault and schedules Cloudflare/Convex
   provisioning.

The good part of this contract is that user repository creation does not depend
on live GitHub reads. The weak part is that the export script currently collects
filesystem state directly, not an explicit source snapshot.

## External App Snapshot

`https://github.com/notermd/app` resolved on 2026-04-28 to:

- `main`: `1284e8dc6b41e9316fbe37292caf2316354d7041`
- visible tag from `ls-remote`: `v2-monorepo-react-tanstack-router`

The repo is materially different from the monorepo starter:

- uses TanStack Router and generated route tree files,
- commits Convex `_generated` files and imports the typed `api`,
- includes Cloudflare build commands,
- includes `pnpm-lock.yaml`,
- uses `pnpm@10.33.0` and newer Vite+ packages,
- includes Convex AI `.agents` skills,
- includes a QR share block and an `/about` route.

Its `main` history is also part of the authored template. The repository has 14
small, intentionally staged commits, plus `REPO_HISTORY.md`, so preserving that
history gives generated apps a readable build-up narrative instead of a single
opaque seed commit.

The upstream README still references
`https://github.com/noter-md/convex-cloudflare-pages-stack`, so the public setup
copy should be refreshed before this repo is treated as the canonical Noter
starter.

## Local Validation Performed

Before testing in this worktree:

```bash
pnpm anon:once
pnpm anon
```

Local `apps/noter-starter-template` checks:

```bash
pnpm check:starter
pnpm build:starter
pnpm --filter noter exec vp test run convex/starterSeed.test.ts convex/starterSeedManifest.test.ts
CONVEX_AGENT_MODE=anonymous NOTER_DEV_PORT=43123 NOTER_DEV_STRICT_PORT=1 pnpm dev:starter
curl -I http://localhost:43123/
```

Observed result:

- `check:starter` passed.
- `build:starter` passed.
- starter manifest/seeding unit tests passed: 2 files, 7 tests.
- local dev smoke returned `HTTP/1.1 200 OK`.

External `notermd/app` checks from a temporary clone:

```bash
vp install
vp check
vp run build
CONVEX_AGENT_MODE=anonymous vp run dev
curl -I http://localhost:5173/
```

Observed result:

- install passed with `pnpm v10.33.0`,
- `vp check` passed,
- `vp run build` passed,
- anonymous dev smoke returned `HTTP/1.1 200 OK`,
- Convex warned that AI files are out of date.

History preservation rehearsal:

```bash
rm -rf /tmp/notermd-history-target.git
git init --bare /tmp/notermd-history-target.git
git -C /tmp/notermd-app.JyaFxK/app push /tmp/notermd-history-target.git main:refs/heads/main
git --git-dir=/tmp/notermd-history-target.git symbolic-ref HEAD refs/heads/main
git -C /tmp/notermd-app.JyaFxK/app rev-parse main
git --git-dir=/tmp/notermd-history-target.git rev-parse main
git -C /tmp/notermd-app.JyaFxK/app rev-list --count main
git --git-dir=/tmp/notermd-history-target.git rev-list --count main
```

Observed result:

- source HEAD and target HEAD both resolved to
  `1284e8dc6b41e9316fbe37292caf2316354d7041`,
- source and target `main` both had 14 commits.

## Current Exporter Mismatch

Running the local starter dev command generated:

- untracked `apps/noter-starter-template/convex/tsconfig.json`,
- ignored `apps/noter-starter-template/convex/_generated/`.

That matters only as evidence that the current local-directory exporter is the
wrong abstraction for the next template source. Adoption should not ask the
local starter exporter to infer which generated files are legitimate. The
standard should simply be the tracked `notermd/app` tree. If
`convex/_generated/**` is tracked there, it is part of the template. If a file
is not tracked in `notermd/app`, it is not part of the template.

## Options

### Live fetch from a moving GitHub branch during vault creation

Do not do this.

Fetching whatever happens to be on `notermd/app/main` at creation time makes
repository creation depend on branch drift, network latency, and auth/rate-limit
behavior at the exact moment a user creates a project. The generated app should
come from a pinned source commit. The implementation can still use git transport
to copy that pinned history, but the source identity must be explicit before the
user starts creation.

### GitHub template API as the creation path

This preserves GitHub's template-repository identity, but it does not preserve
the authored `main` commit history. GitHub's template docs say branches created
from templates have unrelated histories, and the REST API's
`include_all_branches` option includes files and directory structure from other
branches rather than preserving the source commit graph.

That makes the template API a poor fit if the crafted history is part of the
starter experience.

### Forking `notermd/app`

Forking preserves source history and keeps an upstream relationship, and it may
remain the right fit for the GitHub-only/no-Noter-account flow. It is less
appropriate as the forced Noter-managed app generation path because the user is
asking Noter to generate an app, not necessarily to create a repository that
GitHub labels and treats as a fork.

GitHub's fork API also behaves like a fork operation: it is asynchronous,
accepts fork-specific options such as `default_branch_only`, and creates a fork
under the destination account. That is a different product contract from a
standalone generated repository.

### Vendored copy only

Replacing `apps/noter-starter-template` with a manually copied version of
`notermd/app` is simple, but it recreates the current drift problem under a new
source. The next update would again be manual and hard to audit.

### Generated repository with copied source history

Recommended.

Keep `notermd/app` as the canonical authored app, preserve its `main` history in
generated repositories, and avoid GitHub fork semantics by creating an empty
target repository and pushing the pinned source history into it.

1. Store source metadata in the monorepo: repository URL and source commit.
2. Create the user repository empty, as Noter does today.
3. In a git-capable worker/runtime, fetch the pinned `notermd/app` history and
   push its `main` ref into the empty target repository.
4. Do not copy source tags or non-main branches into the generated repository by
   default.
5. Verify the target repository HEAD equals the pinned source commit before
   recording the vault as ready.
6. Keep any generated manifest as a validation artifact or fallback, not as the
   source of truth for app generation.

This keeps the generated app standalone while preserving the crafted history
that makes `notermd/app` useful as a template.

## Recommended Implementation Shape

Add a source metadata file, for example:

```json
{
  "sourceRepo": "https://github.com/notermd/app.git",
  "sourceCommit": "1284e8dc6b41e9316fbe37292caf2316354d7041"
}
```

Then split starter maintenance into two explicit commands:

```bash
pnpm --filter noter-starter-template run template:fetch-source
pnpm --filter noter-starter-template run template:check-source
```

`template:fetch-source` should be the only command that imports from GitHub.
`template:check-source` should validate the pinned source app without changing
the source tree.

For generation, replace the current single-commit tree seeding with a
history-preserving push:

```bash
git init --bare <source-cache>
git --git-dir=<source-cache> fetch https://github.com/notermd/app.git main
git --git-dir=<source-cache> push <target-repo-url> FETCH_HEAD:refs/heads/main
```

The exact implementation can use a normal or bare clone, but the invariant is
the same: the target `main` commit must equal the pinned `sourceCommit`. The
generated app should not be a GitHub fork unless the product explicitly chooses
the fork flow. It should also not inherit `notermd/app` tags or extra branches:
those describe the template's release/version namespace, not the generated app's
own future release history.

## Recommended Test Contract

Source app validation:

```bash
vp install
vp check
vp run build
CONVEX_AGENT_MODE=anonymous vp run dev
curl -I http://localhost:<vite-port>/
```

History-copy validation:

```bash
pnpm --filter noter-starter-template run template:fetch-source
pnpm --filter noter-starter-template run template:check-source
git -C <generated-repo> rev-parse main
git -C <source-cache> rev-parse main
git -C <generated-repo> rev-list --count main
git -C <source-cache> rev-list --count main
```

Product validation before shipping the migration:

1. Create a temporary Noter-managed repository with a name like
   `tmp-<worktree-id>-starter-source`.
2. Confirm the generated repository is not a GitHub fork.
3. Confirm generated `main` HEAD equals the pinned `notermd/app` source commit.
4. Confirm generated `main` commit count matches the pinned source `main`
   history.
5. Confirm the generated repository has no copied `notermd/app` tags or non-main
   branches.
6. Confirm the seeded repository contains the pinned `notermd/app` tracked files
   and no local starter-only additions.
7. Confirm Cloudflare/Convex provisioning reaches ready state.
8. Confirm the seeded app preview returns 200.

## Follow-Up Decisions

1. Should `notermd/app` be updated to remove stale README references before
   Noter adopts it?
2. Should `notermd/app` update Convex AI files before becoming the pinned
   source?
3. Should the monorepo stay on `pnpm@9` while the starter uses `pnpm@10`, or
   should the snapshot be validated with its own package-manager version only?

## Recommendation

Use `notermd/app` as the canonical authored starter and preserve its crafted
`main` commit history in generated repositories. Do not force the Noter-managed
generation flow to be a GitHub fork. Instead, create an empty target repository,
push only the pinned `notermd/app` `main` history into it, and verify the target
HEAD equals the pinned source commit before continuing provisioning. Do not copy
the source repo's tags or non-main branches by default.

The first implementation PR should add source metadata, replace single-commit
manifest seeding with history-preserving git transport, and add tests/validation
that prove generated repositories preserve the pinned `notermd/app` history
without becoming GitHub forks.

## References

- [GitHub template repository docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository?apiVersion=2022-11-28)
- [GitHub create repository from template REST API](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#create-a-repository-using-a-template)
- [GitHub create fork REST API](https://docs.github.com/en/rest/repos/forks?apiVersion=2022-11-28#create-a-fork)
