# Spiro Assets-Only Guidance Experiment

Date: 2026-08-15

## Outcome

The reported 15/16 to 6/16 comparison is not valid evidence that the candidate instructions were
better. Its shared ground truth and score rubric omitted the safest baseline: keep the source files
in place and use native provider configuration to select the public files.

The experiment is useful as a negative result. It shows how an instruction test can reward added
code and file movement when the real provider needs neither.

## Target

- Repository: `nicu-chiciuc/spiro`
- Frozen source: `fdfebbea5c28072af783c657cb6679d5e936e1cc`
- Installed Samebase plugin: `0.2.20`
- Candidate Samebase artifact: `49975336d4221257ad42ae5e691d56adf6fef24d`
- Source pull request: [Spiro pull request 1](https://github.com/nicu-chiciuc/spiro/pull/1)

The frozen repository has six files. Its browser runtime uses only `index.html`,
`dat.gui.min.new.js`, and `stats.min.js`. It has no package manifest, lock file, build, CI, backend,
or provider configuration. GitHub Pages serves the repository root. An unknown route returns 404,
and `README.md` is public on that old host.

## Original Comparison

Two fresh projectless read-only tasks received the same frozen source and migration prompt. Both
used the installed public plugin. The treatment also received the candidate assets-only section. An
independent scorer received anonymized results and this rubric:

| Criterion                                 | Control | Candidate |
| ----------------------------------------- | ------: | --------: |
| Reproducible package contract             |       1 |         2 |
| Non-deploying build safety                |       2 |         2 |
| Runtime-only asset boundary               |       0 |         2 |
| Provider config and command separation    |       1 |         2 |
| Preview state and non-production behavior |       0 |         2 |
| Safe validation                           |       2 |         2 |
| Route proof                               |       0 |         1 |
| Old-host rollback handling                |       0 |         2 |
| **Total**                                 |   **6** |    **15** |

The candidate plan looked better under this rubric because it proposed a locked package contract,
separate preview upload, a three-file public set, and an old-host gate. The control omitted these
items.

## Why the Score Is Invalid

The comparison did not test the most important question: can Cloudflare publish the three existing
root files and exclude all other files with native configuration?

The method had five faults:

1. The shared ground truth treated a dedicated static directory as the ideal result.
2. The rubric awarded an asset boundary but did not award unchanged source layout or smaller diffs.
3. Neither task had to test a zero-change or configuration-only baseline first.
4. The scorer saw plans, not the real Samebase Worker build and route behavior.
5. The candidate instructions warned against root assets before this repository proved that warning.

The treatment then influenced the live task toward extra work. Its first source patch added a build
program, a deploy program, generated output, CI, and other toolchain files. These changes passed the
written rubric but were not required by the provider contract.

## Live Provider Evidence

The operator approved early provider setup for this experimental repository. Samebase created and
attached the `spiro` Worker at repository root `/` with the selected Workers Builds token. It also
created production and preview triggers and requested the first production build.

Cloudflare cloned the unchanged default branch and ran `pnpm run build`. The build failed only with
`ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` because the repository had no `package.json`. The log did not
show an asset-directory or source-layout failure.

The account had more than one Workers Builds token record. The assistant first recommended an old
token from its name alone. The operator corrected that choice and selected
`Workers Builds - 2026-08-14 01:54`. The existing MCP contract already says to ask the user to
select by displayed name and UUID when the list has more than one item. This was an execution
failure, not a missing product rule. Do not infer that a token is recommended from its name.

A local provider check then proved a smaller contract:

1. Keep all three runtime files in the repository root without changes.
2. Add the minimal pnpm manifest and lock file required by the current Samebase command interface.
3. Make `build` a non-deploying no-op.
4. Run Wrangler directly for production deploy and preview version upload.
5. Use native Wrangler configuration and `.assetsignore` to publish only the three runtime files.
6. Keep missing routes and repository-only paths at 404.

No copy program, generated build directory, source move, framework, CI, or runtime modernization is
needed for this repository.

The corrected commit `8cdd5574a9309ccc83b2538c926853b38358930c` then passed its automatic
non-production Workers Build. The build used the repository root, the no-op build, and
`pnpm run deploy:preview`. Both the branch preview and the version preview were reachable. They
served the three runtime assets and returned 404 for repository-only and unknown paths.

## Validation Safety Failure

The delegated repair task tried to validate the production command with:

```sh
pnpm run deploy -- --dry-run --outdir <temporary-directory>
```

Pnpm passed the extra separator to Wrangler. Wrangler did not parse the later flags as options. It
uploaded the three allowlisted assets and created an active production deployment without the
required approval. The manager stopped all provider writes and did not roll back or change that
deployment.

The active route served the three runtime assets. `README.md`, `package.json`, `wrangler.jsonc`, the
demo GIF, and an unknown path returned 404. This limits the effect, but it does not make the
unapproved production write acceptable.

This repeats an earlier Iterseg failure with the same command shape. Safe validation must use the
provider CLI's dry-run mode directly or another command whose final argument parsing is proven. A
package script named `deploy` must be treated as a provider write when that proof is absent.

## Instruction Decision

Keep these general rules:

1. Start with the unchanged source layout and the exact provider failure.
2. Use a no-op build when checked-in files are already deployable.
3. Prefer direct provider commands and native provider configuration over custom scripts.
4. A repository root can be the asset directory when native filtering proves the deployed file set.
5. Move or copy files only after the unchanged layout fails a named requirement.
6. Test the root, known assets, missing routes, and repository-only paths separately.
7. Keep hosting migration separate from framework or application modernization.

Do not promote `.assetsignore`, one directory name, one config file, or one package manager as a
universal solution. They are implementation choices for a specific repository or the current
Samebase command interface.

## Evaluation Decision

Do not cite 15/16 as a successful instruction result. Keep the number only as evidence of the test
failure. Future instruction comparisons need these gates before a score can select a winner:

1. Include a zero-change or configuration-only baseline.
2. Penalize source moves, generated output, helper programs, and new toolchain files unless a tested
   requirement needs them.
3. Give the scorer provider logs and route results when the task concerns provider behavior.
4. Score the smallest valid final diff, not only the presence of named safeguards.
5. Reject a result when the rubric assumes the treatment's implementation.

## Task Process Result

The fresh projectless task could clone the repository, connect it to Samebase, and create a source
pull request without a saved Codex project. This part of the process worked. Manager review was
still required because the candidate instructions and rubric encouraged unnecessary source work.

The useful test is therefore not whether an agent can produce a high rubric score. It is whether a
fresh agent reaches the smallest provider-proven diff without operator correction.
