# Agent-readable starter template updates

Date: 2026-08-28

Status: Research. This document recommends a small staged design. It does not define accepted
product behavior.

## Question

Samebase publishes one starter app, but users change the generated files after creation. We need a
public record that tells an agent what changed in the starter and how to update an existing app
without overwriting user work.

This research answers four related questions:

1. Where should the public changelog live?
2. Should each script contain a Samebase version comment?
3. What exact state is needed to update a changed app safely?
4. What is the smallest useful implementation sequence?

## Conclusion

Put one current starter changelog in the public Samebase plugin. Add one stable link to it from the
starter `AGENTS.md`. Do not copy the changelog into every generated app because that copy becomes
stale as soon as the starter changes again.

Do not add manual Samebase build comments to each script. A comment can state when Samebase last
changed a file, but it cannot prove whether the user's copy still has those bytes. It also does not
cover JSON, Markdown, generated output, binary data, executable flags, additions, deletions, or
renames. The public starter Git history already records the last upstream change for every path.

A safe update needs three exact trees:

- `B`: the old starter tree used as the update base
- `C`: the current user app tree
- `U`: one pinned new commit from the public `samebase/app` repository

Since 2026-02-13, Samebase has created each app with a first commit that has no parent and contains
the complete starter tree. For the first documented automatic update, use that commit only when its
tree exactly matches a public `samebase/app` tree at `v1912` or later. After a complete update,
write one reserved `.samebase/template.json` file with the exact public `samebase/app` commit used
as the new base. This state file is needed only after the first update.

The first implementation should publish the changelog and agent instructions. It should not add an
automatic writer yet. First run the documented method on real temporary app copies. Add code only
after those runs show which repeated work needs a tool.

## Current Samebase flow

### 1. Maintained source

`templates/app` is the source of truth. It currently has 99 tracked files. The export generator
reads the staged Git objects, including bytes and executable flags, at
[`export-samebase-app-manifest.ts`](../scripts/export-samebase-app-manifest.ts#L96).

### 2. Runtime manifest

The generator writes all starter content into
[`starterSeedManifest.generated.ts`](../apps/samebase/convex/starterSeedManifest.generated.ts#L3).
The current manifest has:

- version `samebase-app-d73ed9f64514`
- content hash `d73ed9f645146b6bcb438f7dd0c81edb5bef2560438e6c905f42bd39c14b1a95`
- public repository `https://github.com/samebase/app.git`

The manifest version and hash stay in the Samebase deployment bundle. Samebase does not copy them
into the generated app.

### 3. Generated app root

The seed path creates a tree from every manifest file and then creates one commit with no parents at
[`starterSeed.ts`](../apps/samebase/convex/starterSeed.ts#L424) and
[`starterSeed.ts`](../apps/samebase/convex/starterSeed.ts#L508). Commit `7aa928e74b21` introduced
this rule on 2026-02-13. The focused seed test protects the root-commit rule at
[`starterSeed.test.ts`](../apps/samebase/convex/starterSeed.test.ts#L253).

The root commit is therefore an exact snapshot of the starter used to create a normal
Samebase-managed app after that date. It remains available through ordinary descendant commits while
the app keeps its Git history. The update workflow must still match its tree to a documented public
starter tree before it uses the root as `B`.

### 4. Public starter export

After a change reaches `main`, the repository exporter publishes the exact `templates/app` Git tree
to [`samebase/app`](https://github.com/samebase/app). It preserves bytes, executable flags,
additions, and deletions. It appends the old public head as the parent of the new public commit. The
implementation is at
[`publish-repository-exports.ts`](../scripts/publish-repository-exports.ts#L179), and the accepted
append-only rule is at
[`005_STARTER_TEMPLATE_STRATEGY_SPEC.md`](../specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md#L259).

At this check:

- monorepo commit `8b4ccab9517b05d37649a13386728f991586239d` has `templates/app` tree
  `7c6770f475adc2355970d426330042e21bddbc20`
- public commit
  [`d22ed3dc279d05ffd91434ed7a5aad01b340df43`](https://github.com/samebase/app/commit/d22ed3dc279d05ffd91434ed7a5aad01b340df43)
  has the same tree
- the public branch has 37 commits
- the last eight public commits, from `v1912` through `v1983`, are monorepo exports

The public commit subject contains the Samebase `v<N>` build label. Only the older
`v2-monorepo-react-tanstack-router` tag exists. The current export does not create a tag for each
starter change.

### 5. Public plugin

[`samebase/plugin`](https://github.com/samebase/plugin) is public. The Samebase skill already routes
Samebase operations and can load focused references. It does not yet have an existing-app update
route or a starter changelog.

This is the best place for one current changelog because:

- agents already use the plugin for Samebase work
- the public URL does not depend on access to the private monorepo
- one current file can cover all generated apps
- a plugin release can deliver both the changelog and the instructions that use it

The starter should contain only a stable link to the current public file. It should not contain a
frozen copy that looks current after later releases.

### 6. Generated-file ownership

An update must classify file ownership before it selects a merge action. The current starter already
identifies these owners at [`templates/app/README.md`](../templates/app/README.md#L101):

- TanStack Router owns `src/routeTree.gen.ts`
- Convex owns `convex/_generated/*`
- Convex AI files own their managed files and marked sections
- Vite+ owns its marked `AGENTS.md` section
- the redirect generator owns only the marked block in `public/_redirects`
- the package manager owns the lockfile after package changes

For fully generated output, show the three-tree difference, merge the inputs, run the pinned tool,
and inspect the new output. Do not copy or text-merge the upstream generated file. For a partly
generated file, apply the normal merge rules outside the owned block and regenerate only the owned
block. The changelog must name the generation commands when a starter change affects these files.

### 7. The prerender change that started this discussion

PR [#1540](https://github.com/samebase/samebase/pull/1540) added a `prerender.config.ts` owner in
both the Samebase app and the starter. In each app, TanStack Start and the Cloudflare redirect
generator now read the same local definition. The two apps have different routes, so the data is not
one shared file. They use the same ownership pattern.

The `v1983` changelog entry should tell an agent to update these starter files as one unit:

- `prerender.config.ts`
- `vite.config.ts`
- `scripts/generate-cloudflare-redirects.ts`
- `scripts/generate-cloudflare-redirects.test.ts`
- `README.md`

It must also tell the agent to delete `scripts/cloudflare-prerender-pages.ts`, regenerate
`public/_redirects`, and run the starter checks.

## The two existing meanings of "version"

### Starter manifest version

The generated manifest has a whole-tree content hash and a short version based on that hash. This
proves which bytes Samebase can seed. It does not reach the generated repository, so an agent in
that repository cannot read it.

### Dev launcher SHA header

Three starter launcher files begin with the same SHA-256 header. The generator hashes all three
bodies and rejects stale headers at
[`generate-dev-launcher-version.ts`](../templates/app/scripts/generate-dev-launcher-version.ts#L6).

This is a group integrity check. It answers, "Do these three launcher files form the same checked
set?" It does not answer, "Which starter release did this app use?" Keep this check because the
three launchers must stay synchronized. Do not generalize it to unrelated files.

## The old versioned contract experiment

Commit `760f414806b94f504935bda1a2b746af6d950322`, created on 2026-08-27, added a versioned starter
contract. Its direct child `147af0750ba63eee7d63dfef5a3f9350c184fb6b` removed that wider work so the
prerender pull request could stay focused. Neither commit reached `main`. The removal was a scope
decision, not proof that every idea was wrong.

The first commit changed 44 files with 958 insertions and 278 deletions. It added:

- `.samebase/template.json` with a `v1977` baseline
- `.samebase/CHANGELOG.md` inside the starter
- `// Samebase source build: v1977` in all 15 TypeScript files under `scripts/`
- a 187-line contract checker and a 102-line test
- seed commit trailers with source, build, manifest version, and content hash
- public `v<N>` tag publication

The useful ideas were a public release record, one base identity, grouped update instructions, and
verification commands. The weak parts were:

- the state named the private monorepo instead of the public starter
- the copied changelog would become stale in every generated app
- the comments covered only 15 of 99 tracked files
- a comment was a manual claim, not proof of file bytes
- the comments did not represent executable-flag changes, deletes, renames, or non-TypeScript files
- the checker and tag release flow arrived before any real existing-app update trial

Across the eight public export commits from `v1912` through `v1983`, 29 distinct starter paths were
touched. Only 11 of those paths were TypeScript files under `scripts/`. This count includes a script
that a later export deleted. A script-only marker would omit most of the actual changed paths.

Generating the comments does not solve this problem. A user can edit the file body while leaving the
generated comment unchanged. A generated content hash would detect that edit, but it would only
duplicate the content identity that Git already stores for every file.

## Exact update model

For one path, each tree entry is either absent or `{ bytes, executable flag }`. Equality includes
both bytes and the executable flag. The updater must pin `C` and `U` before it plans changes. A
clean app commit is the safest `C`. `U` must be one exact `samebase/app` commit, not a branch name
that can move during the update.

### All-present cases

| Relation                            | Meaning                               | Safe result           |
| ----------------------------------- | ------------------------------------- | --------------------- |
| `B = C = U`                         | No change                             | No operation          |
| `C = B`, `U != B`                   | Upstream only                         | Take `U`              |
| `U = B`, `C != B`                   | User only                             | Keep `C`              |
| `C = U`, `B != C`                   | Both reached the same value           | Keep the common value |
| `B`, `C`, and `U` are all different | User and upstream changed differently | Report a conflict     |

A text three-way merge can propose a result for the last row. It cannot silently choose `U`.

### Presence cases

| `B`     | `C`               | `U`               | Meaning                      | Safe result                          |
| ------- | ----------------- | ----------------- | ---------------------------- | ------------------------------------ |
| absent  | absent            | absent            | Path does not exist          | No operation                         |
| absent  | absent            | present           | Upstream add                 | Add `U`                              |
| absent  | present           | absent            | User add                     | Keep `C`                             |
| absent  | equal present     | equal present     | Same add                     | Keep the common value                |
| absent  | different present | different present | Both add differently         | Report both-add conflict             |
| present | absent            | absent            | Both delete                  | Keep absent                          |
| present | absent            | equal to `B`      | User delete                  | Keep absent                          |
| present | equal to `B`      | absent            | Upstream delete              | Delete                               |
| present | absent            | changed from `B`  | User delete, upstream modify | Report delete-versus-modify conflict |
| present | changed from `B`  | absent            | User modify, upstream delete | Report modify-versus-delete conflict |

These cases cover text, binary data, and executable-flag changes. They also preserve an intentional
user deletion.

This table defines the safety rule. Samebase must not reimplement Git merging from this table. The
trial command is:

```text
git merge-tree --write-tree --merge-base=<B> <C> <U>
```

Native Git uses the explicit old starter as the merge base and returns a proposed tree plus conflict
records. A local trial used a first commit with the public `v1982` tree as `B`, an unchanged user
child as `C`, and public `v1983` as `U`. Git returned the exact `v1983` tree. The command worked
even though the generated-app commits and public starter commits had unrelated histories. See the
official [`git merge-tree` documentation](https://git-scm.com/docs/git-merge-tree).

### Renames

A Git tree stores paths, not rename records. A rename is inferred from a delete and an add. The
agent can use Git similarity and a changelog hint to propose a rename, but it must use the normal
content rules after it finds the old and new paths. If identity is not clear, report delete and add
events. More conflicts are safer than overwriting user work.

### Partial and rejected updates

Do not advance the base while some paths are unresolved. A repeated run is still safe because files
already updated to `U` match `U`.

The user can resolve a conflict by keeping local behavior. After all paths are reviewed and checks
pass, the base can advance to `U` even when some final files differ from `U`. On the next update,
those files correctly appear as user changes relative to the new base.

## What other tools do

| System                                                                                                                                          | Stored or reconstructed state                                 | Update behavior                                                                                                                                       | Lesson for Samebase                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [GitHub repository templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) | No continuing template base                                   | Creates one commit with history unrelated to the source template                                                                                      | Samebase needs its own update contract. GitHub cannot merge the template history into the generated app. |
| [Copier](https://copier.readthedocs.io/en/stable/updating/)                                                                                     | Source ref and answers in `.copier-answers.yml`               | Regenerates the old and new outputs, replays the user diff, and reports conflicts                                                                     | Preserve an exact old generated result before applying new template changes                              |
| [Cruft](https://cruft.github.io/cruft/)                                                                                                         | Template Git commit, context, and skip rules in `.cruft.json` | Generates old and new outputs, applies a Git three-way patch, then advances the commit                                                                | One central base commit is enough when the template has a public immutable history                       |
| [Angular](https://angular.dev/cli/update)                                                                                                       | Installed package versions                                    | Runs version-specific update schematics and supports migration-only ranges                                                                            | Semantic migrations need ordered release identity, not file comments                                     |
| [Nx](https://nx.dev/docs/guides/tips-n-tricks/advanced-update)                                                                                  | Installed versions plus a generated `migrations.json` plan    | Generates an ordered migration plan that users can review, change, run, and commit. Some migrations include a prompt that an installed agent applies. | Add executable migrations only when a repeated change proves that plain merge guidance is not enough     |
| [Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html#the-update-task)                                                            | Framework version                                             | Regenerates known framework files and asks about conflicts                                                                                            | Interactive review is a valid first product before full automation                                       |
| [React Native](https://reactnative.dev/docs/upgrading)                                                                                          | Selected old and new versions                                 | Upgrade Helper shows generated file differences for manual application                                                                                | A public version-to-version diff can be useful even without an automatic writer                          |
| [Expo CNG](https://docs.expo.dev/workflow/continuous-native-generation/)                                                                        | Package version plus declarative config and plugins           | Deletes and regenerates native projects when users do not edit generated output directly                                                              | Full regeneration is correct only when ownership forbids direct changes                                  |
| [projen](https://github.com/projen/projen)                                                                                                      | A program that owns generated configuration                   | Regenerates read-only files and checks for manual edits                                                                                               | Samebase cannot use this model for the whole app because users own and edit the starter files            |
| [shadcn](https://ui.shadcn.com/docs/cli#add)                                                                                                    | Project configuration, but no installed-item base ledger      | Its `add` command supports `--diff` and explicit `--overwrite`. Separate commands handle selected migrations.                                         | A latest diff helps review, but it does not replace an exact old base for safe automatic updates         |

The common split is clear:

- Systems that preserve user edits reconstruct an old base and report conflicts.
- Systems that regenerate safely declare the generated files as tool-owned and reject manual edits.
- Versioned semantic migrations are separate from byte-level merge state.
- None of the reviewed official workflows uses manual per-file build comments as its primary
  correctness contract.

## Candidate Samebase contracts

| Contract                                                            | Correctness                                           | Adoption cost | Maintenance cost                                | Decision                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| Public changelog only                                               | Cannot identify user edits                            | Low           | Low                                             | Keep as explanation, reject as merge state                                          |
| Changelog plus per-script `v<N>` comments                           | Still cannot prove bytes and omits most file types    | Medium        | High for every starter change                   | Reject                                                                              |
| Seed and update commit trailers                                     | Can point to an exact base                            | Low           | Low                                             | Reject as the only state because squash messages are editable and can drop trailers |
| Public release tags plus a baseline file in every new starter       | Exact if every tag is immutable                       | Medium        | Medium due to tag and baseline release coupling | Defer until a readable release alias proves useful                                  |
| Root base for the first update, then one app-local base commit file | Exact, covers all Git entries, preserves user changes | Low           | Low                                             | Recommend                                                                           |
| Full old tree stored inside each app                                | Exact and independent of public history               | High          | High due to duplicate files and integrity rules | Reject                                                                              |
| Regenerate the complete starter                                     | Overwrites normal user edits                          | Low           | Low                                             | Reject for Samebase apps                                                            |

Commit trailers are valid structured Git data. However, GitHub lets a person edit the squash commit
message, and repository settings can choose a message that omits source commit bodies. A reserved
file usually survives squash and rebase when the resulting tree keeps that file. See the official
[Git trailer documentation](https://git-scm.com/docs/git-interpret-trailers) and
[GitHub squash message documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests).

## Recommended trial design

### One current changelog

Add this public plugin reference:

```text
packages/plugin/plugins/samebase/skills/samebase/references/starter-template-changelog.md
```

Its stable public page will be:

```text
https://github.com/samebase/plugin/blob/main/plugins/samebase/skills/samebase/references/starter-template-changelog.md
```

Put a short "How to use this changelog" section at the top of the same file. Route an "update my
Samebase starter" request from the main Samebase skill to that file. Add one stable public URL to
the starter `AGENTS.md` so an agent can find the latest changelog even when the locally installed
plugin is old. Do not create a second workflow reference until real update trials show that the
changelog is hard to use.

Each changelog entry must contain only information that helps an update:

```text
## v<N>: title

- User impact
- Exact affected paths
- Files or paths that must update together
- Delete and rename instructions
- Tools that generate files and their commands
- Steps that a file diff cannot show
- Verification commands
```

Add entries only when `templates/app` changes. Use the Samebase build label already present in the
public export commit subject. Backfill the eight exported changes from `v1912` through `v1983`.
Treat `v1912` as the first documented automatic base. For an older app, an agent can inspect its
root during a manual trial, but the first changelog does not give complete instructions for that
period. Do not claim automatic support for older apps until real update trials prove it.

The changelog is guidance. It is not proof that a file is current.

### Exact base state

For the first documented automatic update of a Samebase-created app:

1. Require a clean branch or commit the current app state as `C`.
2. Identify the Samebase seed root, which is the first commit and has no parent.
3. Match its complete tree to a public `samebase/app` commit at `v1912` or later, then use that
   public commit as `B`.
4. If `.samebase/template.json` appeared anywhere in reachable history and is now absent, stop. Do
   not fall back to the root.
5. Fetch public `samebase/app` history.
6. Resolve `main` once to one exact commit and use that commit as `U`.
7. Classify the tools that generate files, then apply the `B`, `C`, and `U` rules to authored paths
   and executable flags.
8. Read changelog entries for groups, generation commands, steps that a file diff cannot show, and
   checks.
9. Stop on unresolved conflicts. Never guess a missing base.
10. After every path is resolved and verification passes, write and commit the new base state with
    the accepted update.

The proposed state is:

```json
{
  "baseCommit": "<exact public commit SHA>"
}
```

Store it at `.samebase/template.json` only after the first complete update. On later updates, use
`baseCommit` as `B`. Reserve this exact path for the update workflow, and require it to be absent
from both `B` and `U`. Native Git then keeps the current state file as a `C`-only path. Replace its
base only after verification passes. If an existing app already uses the path for another purpose,
stop and resolve that path before the first update.

The history check prevents an overwrite after lost state. A user can restore a file to the original
root value after an earlier update. If the updater then uses the root as `B`, it can mistake that
user choice for an unchanged starter file and replace it.

Validate `baseCommit`. The update workflow owns the fixed public upstream
`https://github.com/samebase/app.git`, and the base commit must exist in that repository. Do not let
an app file select a different code source. The base commit must be an ancestor of the pinned `U` on
public `main`. If the file is absent, use the root only for a Samebase-created repository whose root
exactly matches a documented public starter tree at `v1912` or later and whose reachable history
never contained the state file. Otherwise stop and ask for an explicit base. Stop if the state file
has an uncommitted change or Git history shows a separate manual edit.

Do not add these fields:

- `updatedAt`, because Git records the operation time
- `latest`, because the updater pins `U` at operation start
- per-file hashes, because `B`, `C`, and `U` already contain every path, byte, and executable flag
- generated-file rules, because those rules belong in update instructions
- rename maps, because release-specific rename hints belong in the changelog
- an upstream URL, because Samebase must not trust a repository-selected code source

### Why no initial state file

An eligible first update already has an exact `B` because its root tree matches a documented public
commit. Creating a public export commit happens after the source change reaches `main`, while
Samebase builds the runtime manifest before that public commit exists. Delaying the state file until
the first update avoids new seed and publication coupling. It also works for existing eligible apps
without a migration.

### How to check one specific file

The user's per-file question remains easy to answer without a comment:

1. Compare that path in `B`, `C`, and `U`.
2. Read the public Git history for the last upstream commit that changed the path.
3. Read the matching changelog entry for steps that a file diff cannot show.

This works for every tracked path, including a deleted file. A source comment works only while the
comment itself remains correct.

## Phased implementation

### Phase 1: Public guidance

Make one small plugin and starter documentation change:

- add the public changelog reference
- put the short update workflow at the top of that file
- backfill `v1912` through `v1983`
- route update requests from the Samebase skill
- add one stable public changelog link to the starter `AGENTS.md`
- bump the required plugin patch version
- regenerate the starter manifest because `AGENTS.md` changed

Do not add an updater script, public tags, per-file comments, seed trailers, or a release checker in
this phase.

### Phase 2: Real update trials

Use temporary copies, not user repositories. Test at least:

- an unchanged current starter
- one app from before the monorepo export
- one app created before the public starter history and one app created before complete root seeding
- local edits in files also changed upstream
- a user deletion and an upstream modification
- both-add and modify-versus-delete conflicts
- an executable-flag change and a binary file
- the `v1982` and `v1983` prerender sequence
- generated route tree, Convex output, redirect block, and lockfile ownership
- a partial update that resumes safely
- a resolved conflict where the user keeps local behavior and advances the base

Use native `git merge-tree` with the explicit `B`. Record the planned actions, actual diff,
conflicts, checks, and final base for each run.

### Phase 3: Add a tool only after the trials

If the trials repeat the same mechanical work, add a thin read-only planner around native Git. Do
not implement a new merge engine. Its output must list safe changes, conflicts, tools that generate
files, and the pinned `B` and `U`. It must make no file changes.

Only after the planner is trusted should Samebase add a writer that applies safe changes and writes
`.samebase/template.json` after successful verification. A migration registry is justified only when
multiple changes cannot be expressed as a three-tree merge plus short changelog instructions.

## When the update must stop

- If the app has no reliable root and no base file, stop. Do not infer `B` from `C`.
- If the root does not exactly match a documented public starter tree, keep the app in the manual
  trial path.
- If the state file existed in reachable history and is now missing, stop. Do not return to the
  original root base.
- If the public base commit is missing, stop. The accepted public history is append-only, so this is
  a contract failure.
- If the worktree is dirty, commit or clean it before planning so `C` does not move during the run.
- If a generated file changed locally, show that change before regeneration.
- If a rename is ambiguous, report delete and add events.
- If a validation command fails, do not advance the base.
- A connected repository that did not start from the Samebase starter needs an explicit base or a
  manual update. Do not apply the root rule to it automatically.

## Sources

Samebase evidence:

- [samebase/app](https://github.com/samebase/app)
- [samebase/plugin](https://github.com/samebase/plugin)
- [PR #1540](https://github.com/samebase/samebase/pull/1540)
- [`docs/repository-exports.md`](../docs/repository-exports.md)
- [`specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`](../specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md)

Official external sources:

- [Copier update process](https://copier.readthedocs.io/en/stable/updating/)
- [GitHub repository templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)
- [Cruft](https://cruft.github.io/cruft/)
- [Cruft update implementation](https://github.com/cruft/cruft/blob/main/cruft/_commands/update.py)
- [Angular update command](https://angular.dev/cli/update)
- [Angular update schematics](https://angular.dev/tools/cli/schematics)
- [Nx advanced update process](https://nx.dev/docs/guides/tips-n-tricks/advanced-update)
- [Rails update task](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html#the-update-task)
- [React Native upgrade process](https://reactnative.dev/docs/upgrading)
- [Expo Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [projen](https://github.com/projen/projen)
- [shadcn CLI](https://ui.shadcn.com/docs/cli)
- [Git objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [Git merge-tree](https://git-scm.com/docs/git-merge-tree)
- [Git trailers](https://git-scm.com/docs/git-interpret-trailers)
- [GitHub squash commits](https://docs.github.com/en/pull-requests/reference/pull-request-merges#squash-and-merge-your-commits)
