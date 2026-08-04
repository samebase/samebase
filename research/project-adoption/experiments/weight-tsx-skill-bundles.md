# Weight TSX skill-bundle comparison

Date: 2026-08-04

## Outcome

The short public Samebase skill won both controlled comparisons:

- read-only preflight: 28/32, compared with 22/32 for the public skill plus the detailed bundle
- local implementation: 28/32, compared with 25/32 for the public skill plus the detailed bundle

Keep the public skill as the default and retire the detailed adoption bundle. The extra bundle found
some useful target details, but it did not justify its added process, unsupported claims, version
drift, or output cost.

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
- creating a Worker or configuring Builds can start the first production build, so named approval
  must cover those actions

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

Operator review later clarified the approval timing. One informed approval can cover a named write
sequence after the repository, provider account, possible production effect, and rule for attaching
an existing resource or creating a new one are clear. The agent asks again only when a verified fact
or the approved scope changes.

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

## Controlled implementation result

The implementation comparison used the same frozen target, public reference, task, operator
decisions, model, and runtime policy. Both runs preserved Password auth and the shared authenticated
dataset. Neither run used GitHub, Samebase, a browser, MCP, a provider action, a push, a pull
request, or a deployment.

The common task required a focused local gate: formatting, lint, type checks, focused command tests,
a production build, and credential-free Cloudflare dry runs. Both specimens passed independent
reruns of that gate.

| Measure          |  Public skill | Public plus detailed bundle |
| ---------------- | ------------: | --------------------------: |
| Blind score      |         28/32 |                       25/32 |
| Runtime          | 12 min 45 sec |               15 min 13 sec |
| Result words     |           986 |                       1,618 |
| Output tokens    |        28,586 |                      34,986 |
| Focused tests    |            14 |                          11 |
| Built JavaScript |     605.13 kB |                   662.58 kB |
| Built modules    |           909 |                         972 |

The public-only specimen was safer to continue. It kept the frozen shared dependency versions,
covered more build and deploy boundaries, used cross-platform dry-run documentation, and produced a
shorter report.

The detailed-bundle specimen added three useful implementation ideas:

- show an explicit setup state when `VITE_CONVEX_URL` is missing
- document that both Cloudflare triggers store both Convex secrets while the build wrapper exposes
  only the selected value
- pass the supplied environment through the deploy wrapper for focused tests

These are target or public-reference improvements. They do not require a second adoption skill.

The detailed-bundle specimen also:

- resolved React, Convex, Tailwind, date-fns, and Recharts past the frozen reference or target
  versions
- produced 57.45 kB more minified JavaScript and transformed 63 more modules
- added a longer self-certified gate report and registry audits outside the common validation task
- spent about 19% more wall time and 22% more output tokens

The public-only specimen was not perfect. It removed one credential-adjacent log even though the
task deferred unrelated defects, lacked the missing-Convex-URL setup state, and copied one unused
dependency override. Continue from it only after a focused review applies the useful candidate
changes and removes the unrelated cleanup.

An isolation audit passed both specimens and the comparison. Each first Wrangler dry run attempted
to write its default diagnostic log outside the run root. The sandbox blocked both attempts. Both
implementations then moved the log inside their target and repeated the dry run successfully. The
audit proves recorded behavior, not host-level filesystem or network activity.

## Final decision

Remove the detailed adoption skill and contract. The public plugin, the public `samebase/app`
reference, the live action contract, and a target-specific operator decision record are sufficient
inputs for this type of adoption.

This is one target and one implementation sample per bundle, so it does not prove that every long
skill is harmful. It does show that this detailed bundle failed twice against the shorter public
skill and should not remain as a second source of Samebase behavior.
