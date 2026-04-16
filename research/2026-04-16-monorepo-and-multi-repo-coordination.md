# Monorepo And Multi-Repo Coordination Research

Date: 2026-04-16

## Why This Document Exists

We keep circling around one overloaded question:

- Should related code live in one monorepo or in multiple repositories?
- If code is split, how do we still upgrade shared dependencies together?
- Which tools help with versioning, and which only help with build/task
  orchestration or local checkout convenience?

Those are related, but they are not the same problem. This memo separates them
so future decisions do not collapse "monorepo", "versioning", and "multi-repo
dev workflow" into one bucket.

## Why This Lives In `research`

This is a current-state comparison and recommendation memo. It informs repo
decisions, but it does not define a new product or repo contract by itself.

## Current Repo Context

Relevant local context:

- Noter already runs as a `pnpm` monorepo.
- `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md` explicitly defers the question
  of whether the starter template should stay monorepo-local or move to its own
  repository.
- `specs/030_MONOREPO_TYPESCRIPT_RUNTIME_AND_PORTABILITY_SPEC.md` already
  assumes a growing internal monorepo package surface.

That means the practical question is not "should we adopt monorepo tooling from
zero?" It is:

1. What is the best version/dependency governance model while we are already in
   a monorepo?
2. If a future split happens, what coordination model replaces monorepo
   guarantees?

## Problem Decomposition

There are four distinct concerns here:

### 1. Repository topology

Do related projects live in one Git repository or several?

### 2. Dependency governance

How do we keep shared dependency versions aligned and update them safely?

### 3. Release and version policy

When package A changes, do A and B version together, independently, or according
to an explicit policy?

### 4. Multi-repo local workflow

If code is split across repos, how do developers check out, sync, and work on
them together?

No single tool cleanly solves all four.

## Evaluation Criteria

I compared options against these constraints:

1. Can we make atomic cross-project changes and land them in one PR?
2. Can we keep dependency versions aligned without hand-editing many files?
3. Can some projects version independently while others version together?
4. Does the setup fit a JS/TS + `pnpm` stack?
5. Does it help local multi-repo workflow when code must be split?
6. Does it add governance clarity instead of just more moving parts?

## Research Findings

### `pnpm` already covers the monorepo foundation, but not release policy

`pnpm` workspaces provide the baseline monorepo structure. The docs describe
workspace support as built-in monorepo support, and the `workspace:` protocol
lets us fail closed so a dependency resolves only to a local workspace package,
not to an arbitrary registry version.

`pnpm` catalogs solve the "keep shared dependency versions aligned" part well.
They let the workspace define reusable dependency version constants in
`pnpm-workspace.yaml`, and packages can reference those shared values with the
`catalog:` protocol.

Important limit: `pnpm` explicitly says versioning packages inside a workspace
is a complex task and recommends external tools for release workflow. Their docs
call out Changesets and Rush as the tested options.

Implication:

- `pnpm` is the right dependency/workspace layer.
- It is not the full answer for release/version policy by itself.

### Changesets is the lightest strong default for JS/TS monorepo versioning

Changesets gives two useful coordination modes:

- `fixed` packages: packages in the group are versioned and published together.
  Even unchanged packages in the fixed group are bumped and published so the set
  stays aligned.
- `linked` packages: packages version together only when they participate in a
  release. This is lighter than full lockstep.

Implication:

- If the main need is "some packages should release together" inside a JS/TS
  monorepo, Changesets is the simplest serious answer.
- It is a better fit than inventing custom scripts for version propagation.

### Nx Release is stronger when one repo contains multiple release trains

Nx Release adds explicit release groups.

- A group can be `fixed`, meaning every project in that group shares one version
  and is versioned together.
- A group can be `independent`, meaning each project keeps its own version.
- Nx can automatically cascade dependent updates across release-group boundaries
  via `updateDependents`.

Implication:

- Nx is attractive when one monorepo contains multiple independent apps,
  libraries, or services that do not all belong in one global lockstep.
- It is more configuration-heavy than Changesets, but it models mixed release
  strategies better.

### Rush is the strongest policy-driven option, but heavier

Rush version policies distinguish between:

- `lockStepVersion`: packages act as one unified product and always publish
  together with the same version number.
- `individualVersion`: packages version independently.
- `lockedMajor`: even independently versioned projects can be forced to share a
  major version line.

Rush also ties these policies directly into `rush change`, `rush version`, and
`rush publish`.

Implication:

- Rush is a good fit when version policy itself is the hard problem.
- It is probably overkill when the repo mainly needs sane JS/TS package release
  automation.

### Turborepo is not a version-management answer

Turborepo's docs are explicit: Turborepo does not manage dependencies. That is
left to the package manager. Their dependency docs point back to workspace
package-manager features and separate tools such as `syncpack`, `manypkg`, or
`pnpm` catalogs.

Implication:

- Turborepo may still be useful for task orchestration and caching.
- It should not be chosen as the answer to "how do we keep versions aligned or
  release together?"

### Multi-repo manifest tools help checkout and sync, not atomic versioning

Google's `repo` tool is a clean example of the "many repos, one local workspace"
model.

- Android's docs say Repo complements Git by simplifying work across multiple
  repositories.
- A version-controlled manifest repository defines which repos appear in the
  local workspace and where they are checked out.
- `repo sync` effectively runs fetch/rebase-style synchronization across all
  managed repositories.

This is useful for local workflow, but it does not create monorepo semantics:

- changes still live in multiple Git repos,
- reviews still happen per repo,
- releases are still coordinated rather than atomic.

Implication:

- Use a manifest/meta-repo only if local multi-repo setup becomes painful.
- Do not confuse that with a release/versioning solution.

### Bot-driven coordination works for polyrepo hygiene, not true atomic change

For repos that stay separate, the realistic coordination layer is dependency
automation plus explicit compatibility policy.

GitHub Dependabot now supports multi-ecosystem groups, but the feature is
configured inside one repository's `dependabot.yml` and produces a single PR for
grouped ecosystems in that repository.

Renovate is stronger for multi-repo standardization:

- shareable config presets can live in a separate repository and be extended by
  many repos,
- `groupName` and curated group presets reduce dependency PR noise.

Still, Renovate runs per repository. It standardizes policy across repos, but it
does not turn many repos into one atomic change unit.

Implication:

- Polyrepo upgrade coordination is eventually consistent by nature.
- Bots can reduce toil, but they do not replace monorepo guarantees.

### Git submodules are a poor fit for this use case

Git submodules pin a commit recorded in the superproject, and
`git submodule update` checks out the commit that the superproject expects. That
is useful for vendoring or strict SHA pinning.

For active multi-repo development, the ergonomics are weak:

- detached-HEAD defaults,
- superproject commit pinning overhead,
- awkward day-to-day topic branch flow,
- versioning still lives outside the submodule mechanism.

Android's own Repo guidance explicitly says to avoid the `git submodule` feature
of Repo for Android development.

Implication:

- Do not use submodules as a substitute for monorepo version policy or polyrepo
  coordination.

## Option Summary

### Option A: Stay in one `pnpm` monorepo with catalogs plus Changesets

Best fit when:

- projects share a release cadence or at least frequent atomic changes,
- the repo is primarily JS/TS,
- we want the smallest extra governance layer.

Strengths:

- one PR and one revert for cross-project changes,
- centralized dependency ranges via `catalog:`,
- simple fixed or linked release groups.

Weaknesses:

- less expressive than Nx/Rush when release topology becomes very mixed.

### Option B: Stay in one monorepo and add Nx Release

Best fit when:

- we still want one repo,
- but some project groups need lockstep release and others need independent
  release,
- dependent-version propagation across group boundaries matters.

Strengths:

- explicit release groups,
- fixed and independent modes,
- automatic dependent update cascades.

Weaknesses:

- more platform/configuration weight than Changesets.

### Option C: Stay in one monorepo and add Rush

Best fit when:

- package publishing governance becomes the core concern,
- release policy must be formal and enforced,
- the package surface becomes large and organization-wide.

Strengths:

- strong version policy model,
- lockstep and independent strategies,
- optional locked-major enforcement.

Weaknesses:

- heaviest operational model of the monorepo options reviewed here.

### Option D: Split into multiple repos and use a manifest/meta-repo

Best fit when:

- repos truly need independent lifecycle or ownership,
- but developers still need a one-command "get the whole working set" flow.

Strengths:

- cleaner repo boundaries,
- easier local coordination than manual clone scripts.

Weaknesses:

- no atomic PR or merge,
- no built-in version policy,
- still requires separate release automation.

### Option E: Split into multiple repos and standardize bot policy

Best fit when:

- repos must remain separate,
- dependency PR volume and drift are the main pain.

Strengths:

- shared Renovate presets scale well,
- grouped bot PRs reduce noise,
- explicit compatibility sweeps are possible.

Weaknesses:

- upgrades remain coordinated, not atomic,
- cross-repo breakage is discovered later than in a monorepo.

### Option F: Use submodules

Assessment:

- not recommended for this problem.

## Recommendation

### Default recommendation for Noter

For this repo, the default answer should remain:

1. Keep related JS/TS projects in the existing `pnpm` monorepo when they need
   frequent atomic changes or coordinated dependency upgrades.
2. Use `catalog:` for shared dependency versions.
3. If release/versioning needs become real, add Changesets first.
4. Move to Nx Release only if we genuinely outgrow simple fixed/linked groups.
5. Reach for Rush only if version policy governance becomes a platform problem,
   not just an app-repo problem.

This is the lowest-complexity path that still directly addresses "upgrade things
together".

### Recommendation if a future repo split is required

If a project must move to a separate repo for ownership or lifecycle reasons:

- accept that atomic upgrades are gone,
- use Renovate shared presets to standardize update policy,
- add explicit compatibility-sweep CI where needed,
- optionally add a manifest/meta-repo only if local multi-repo checkout becomes
  painful.

Do not try to recreate monorepo guarantees with submodules.

## Implications For The Starter Template Question

The deferred "starter template in monorepo vs separate repo" question in
`specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md` is mostly a lifecycle-boundary
decision, not a tooling discovery problem.

The practical rule is:

- If template and app need frequent atomic changes, keep them together.
- If the template becomes a separately versioned product, split it out and treat
  cross-repo coordination as an explicit release process.

A repo split would not make coordinated upgrades easier. It would only make the
boundary cleaner and the lifecycle more independent.

## Decision Triggers

### Stay monorepo when

- one PR should be able to update code across boundaries,
- one lockfile is a feature, not a burden,
- shared dependency alignment is frequent,
- the same team owns most of the change surface.

### Split to separate repos when

- access control or ownership boundaries differ materially,
- release cadence differs enough that shared PRs become noise,
- consumers need a separately versioned artifact more than they need atomic
  cross-repo edits.

## Sources

- [pnpm workspaces](https://pnpm.io/workspaces)
- [pnpm catalogs](https://pnpm.io/catalogs)
- [Changesets fixed packages](https://akinoccc.github.io/changesets/guide/advance/fixed-packages)
- [Changesets linked packages](https://akinoccc.github.io/changesets/guide/advance/linked-packages)
- [Nx release groups](https://nx.dev/docs/guides/nx-release/release-groups)
- [Rush version policies](https://rushjs.io/pages/configs/version-policies_json/)
- [Turborepo dependency management](https://turborepo.dev/docs/crafting-your-repository/managing-dependencies)
- [Dependabot multi-ecosystem updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configuring-multi-ecosystem-updates)
- [Renovate shareable config presets](https://docs.renovatebot.com/config-presets/)
- [Renovate configuration options](https://docs.renovatebot.com/configuration-options/)
- [Renovate group presets](https://docs.renovatebot.com/presets-group/)
- [Android Repo command reference](https://source.android.com/docs/setup/reference/repo)
- [repo manifest format](https://gerrit.googlesource.com/git-repo/+/HEAD/docs/manifest-format.md)
- [git submodule documentation](https://git-scm.com/docs/git-submodule)
