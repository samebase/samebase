# Weight TSX skill-bundle comparison

Date: 2026-08-04

## Outcome

The short public Samebase skill produced the better read-only adoption plan. It scored 28/32. The
same skill plus the detailed adoption skill and contract scored 22/32.

Keep the public skill as the default input. Do not promote the detailed adoption bundle as the
default. Its useful findings do not justify its added process, target-specific branches, unsupported
claims, or output cost.

The result is material enough to test both bundles during a controlled repository implementation.
The detailed bundle found two real target defects and stated one production approval boundary more
clearly. The next test must determine if those benefits survive when the agent edits and validates
the project.

## Question

Can a detailed Samebase adoption skill help an agent that already has the public Samebase skill, or
does the additional workflow cause overfitting and excess work?

The test used these frozen inputs:

- target: `nicu-chiciuc/weight_tsx` at `e26a38348dca39adbf7096d7a5ed1661ffeb3572`
- public reference: `samebase/app` at `0808a374d6cfd01736f3b6823c1a73ab73cc26a9`
- Samebase skill artifact: `230646b5e01f6fc75f0549490e7f9da3227dcf5a`
- model: GPT-5.6 Sol, high reasoning effort

Run A received only the public Samebase skill. Run B received the same public skill plus the
170-line detailed adoption skill and its 236-line contract. The task, target, reference, public
skill, model, effort, sandbox policy, and network policy were identical.

## Method

The first app-created pilot was not valid evidence. Both task contexts advertised the installed
public Samebase plugin. The pilot was discarded.

The replacement runs used the bundled Codex CLI with user configuration ignored. Plugins, apps,
browser control, computer control, multi-agent work, and network access were disabled. Each agent
could inspect local frozen inputs and write only one `RESULT.md` plan.

An isolation audit passed both specimens and the comparison. It confirmed that the only skill-tree
difference was the detailed adoption bundle. The audit also found no provider, GitHub, browser, MCP,
sub-agent, install, deploy, commit, push, or target-source write.

This is strong recorded isolation, not host-level proof. The sandbox did not make all unrelated
filesystem reads impossible. The session logs showed no unrelated read.

## Result

| Measure        |                                                       Public skill |                                        Public plus detailed bundle |
| -------------- | -----------------------------------------------------------------: | -----------------------------------------------------------------: |
| Blind score    |                                                              28/32 |                                                              22/32 |
| Result words   |                                                              2,400 |                                                              4,510 |
| Output tokens  |                                                             12,036 |                                                             17,216 |
| Result SHA-256 | `d50ffb975ebbd34d504ce5da2f9d117178e4b54ef64edd5c9d80254ce177ab9a` | `0deae3828276e8a43cc97fe5a85439ab3d73bb8fe40e3dcf18c3fdf317d75121` |

The public-only plan was more accurate, more proportionate, and more focused. It preserved the
target product, separated unresolved ownership and PWA choices, and proposed focused validation.

The detailed bundle found useful facts that the public-only plan missed:

- notes do not survive the current import and export round trip
- invalid import lines are silently excluded from the result count
- creating a Worker or configuring Builds can start the first production build, so the agent must
  stop for named approval immediately before that action

The detailed bundle also caused harmful overreach:

- it required duplicate worktree cycles and several evidence registers
- it added fixed 30-minute and 24-hour observation periods without project evidence
- it required reviewer and delegation structures that were not part of the migration
- it added a Teardown-specific Cloudflare error branch
- it incorrectly said that the frozen public reference had no repository CI
- it invented a verified rollback host and deployment that the target did not contain
- it overstated the import grammar and one accessibility property

## Decision

Keep goals, stable Samebase invariants, and action boundaries in the public skill. Keep project
facts and operator choices in the task. Do not encode one migration's execution history as the next
migration's required workflow.

Do not copy the detailed bundle into the public plugin. Extract a rule only when it is:

1. specific to Samebase
2. supported by the current public app or action contract
3. useful across target types
4. short enough that it does not select the whole workflow for the agent

The first-production-build approval boundary meets these conditions. The public skill now contains
this small rule. The Weight TSX parser defects belong to the target project, not the Samebase skill.

### Focused regression

The public skill at `6e7f8afcda112c9f7212616df36b8672a29ea428` passed a clean focused regression
after the approval rule was added. The run used the same frozen task, target, reference, model,
effort, sandbox, and network policy as the public-only specimen.

The resulting plan had 2,303 words and 12,077 output tokens. It named the actions that start or
request a production build and required explicit approval immediately before each action. It did not
copy the detailed bundle's fixed observation periods, duplicate worktree cycles, reviewer structure,
or target-specific Cloudflare branch.

The focused run had these artifact hashes:

- public skill: `3b863b89cbbd904214c7ce6888875328659bddfa32aa1f52e7c6a7030ddd942f`
- result: `59e2e09bf83b9681bf6a15d75d0b2a6e7a2ee3a141a5eaa3e3654f2265ae74d5`

Its isolated session was `019fcde2-217b-7640-b106-7206353612e3`. The audit found no global Samebase
skill or plugin in the worker context, no network access, no target-source change, and no write
other than `RESULT.md` and normal Git index metadata.

Keep the detailed bundle unchanged until the controlled implementation comparison finishes. After
that test, reduce or remove it instead of maintaining a second default source of Samebase behavior.

## Next test

Run two isolated local implementations against the same frozen target and reference. Give both runs
the same operator decisions and the same proportionate acceptance matrix. Do not allow provider,
GitHub, Samebase, browser, MCP, push, PR, or deployment writes.

The comparison must measure source correctness, diff scope, validation evidence, unnecessary work,
production-approval handling, and agent cost. Review the two patches without revealing which skill
bundle produced each patch.
