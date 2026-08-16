---
name: update-samebase-agent-plugin
description:
  Update the public Samebase agent plugin skill, MCP metadata, manifests, or OpenAI submission
  tests. Use when Samebase capabilities change, before a plugin release, or when reviewer tests need
  repeatable validation across agent models.
---

# Update the Samebase agent plugin

Keep the public skill short. Put only Samebase-specific routing, state, and safety rules in it. Do
not copy tool schemas or general coding instructions into the skill.

## Update

1. Read the live MCP tool descriptions, source contracts, public skill, and
   `apps/samebase/scripts/chatgptAppSubmissionSource.ts`.
2. Delete rules for removed capabilities. Do not preserve internal compatibility.
3. Update the hand-written submission source when tool effects, review prompts, or expected results
   change. Run `pnpm --filter samebase generate:action-docs`.
4. For every change under `packages/plugin`, increase the version in its package manifest and both
   plugin manifests.
5. Run `pnpm run check:plugin` and `pnpm --filter samebase verify:action-docs`.

## Forward-test

1. Take only the eight `user_prompt` values from `chatgpt-app-submission.json`.
2. Start a fresh agent with no prior discussion. Give it the public skill, live tool descriptions,
   and one prompt at a time. Freeze one identical input bundle for every prompt. If the bundle uses
   file paths, allow read-only file commands and prohibit only external or state-changing calls. Do
   not give expected tools, expected outputs, or prior findings. Discard a run when the subject
   could not read the input bundle.
3. Start with the smallest available agent. Run all eight prompts.
4. Run all eight prompts again with a different, stronger agent before release.
5. For a prompt that can change live state, ask for the intended tool sequence unless the user
   approved the live change.
6. Compare results with the submission artifact after the agents finish. Each positive case must
   select the declared tool or tools and preserve the required sequence. Each negative case must not
   select a Samebase tool.
7. If a case fails, simplify the public skill and rerun the full suite on the smallest agent.
8. Update the last-run record below. Include the date, tested artifact commit, models, and result.
   Also put this result in the pull request.

## Last full run

- Date: 2026-08-04
- Artifact commit: `4f265d314`
- Models: GPT-5.6 Terra low and GPT-5.6 Sol low
- Result: all five positive cases and all three negative cases passed

## Last focused stack-alignment run

- Date: 2026-08-04
- Artifact commit: `059edebe`
- Models: GPT-5.6 Terra low and GPT-5.6 Sol low
- Result: both models reported the cost and protected risk of the existing checks, recommended a
  small required gate, and asked the operator to confirm removal of broad Playwright checks. Both
  kept Rust and WASM as target constraints. Neither inferred project importance from technical
  complexity.

## Last focused adoption-bundle comparison

- Date: 2026-08-04
- Artifact commit: `230646b5e01f6fc75f0549490e7f9da3227dcf5a`
- Model: GPT-5.6 Sol, high reasoning effort
- Target: `nicu-chiciuc/weight_tsx` at `e26a38348dca39adbf7096d7a5ed1661ffeb3572`
- Result: clean isolation passed. The public skill won the read-only preflight 28/32 to 22/32 and
  the local implementation 28/32 to 25/32. The public implementation used less time and output,
  preserved the frozen shared versions, covered more build boundaries, and produced the smaller
  bundle. Retire the detailed adoption skill and keep the public plugin as the source of truth. The
  public skill now names the production-build approval boundary. See
  `research/project-adoption/experiments/weight-tsx-skill-bundles.md`.

## Last focused adoption implementation

- Date: 2026-08-04
- Artifact commit: `10e0b91594db18e178676947defa816a3b4a3d37`
- Model: GPT-5.6 Sol, high reasoning effort
- Target: `nicu-chiciuc/weight_tsx` at `e26a38348dca39adbf7096d7a5ed1661ffeb3572`
- Result: both anonymous implementations passed independent format, lint, type, focused test,
  production build, and Cloudflare dry-run checks. The public-only specimen scored 28/32. The
  public-plus-detailed specimen scored 25/32. Continue from the public-only patch after a focused
  review applies the useful missing-configuration and provider-documentation details.

## Last focused production-approval regression

- Date: 2026-08-04
- Artifact commit: `6e7f8afcda112c9f7212616df36b8672a29ea428`
- Model: GPT-5.6 Sol, high reasoning effort
- Target: `nicu-chiciuc/weight_tsx` at `e26a38348dca39adbf7096d7a5ed1661ffeb3572`
- Result: clean isolation passed. The public-only plan named each action that starts or requests a
  production build and required explicit approval immediately before it. The plan stayed focused at
  2,303 words and did not reproduce the detailed bundle's excess process.

Operator review after this regression generalized the timing rule. One informed approval can cover a
named production-build sequence when its repository, provider account, possible production effect,
and rule for attaching an existing resource or creating a new one are clear. The supervised Weight
TSX adoption will test this revised rule without another bundle comparison.

## Last focused static-adoption guidance comparison

- Date: 2026-08-15
- Candidate artifact commit: `49975336d4221257ad42ae5e691d56adf6fef24d`
- Installed plugin: `0.2.20`
- Target: `nicu-chiciuc/spiro` at `fdfebbea5c28072af783c657cb6679d5e936e1cc`
- Result: invalid for instruction selection. Two fresh projectless tasks and an independent blind
  scorer produced 15/16 for the treatment and 6/16 for the control, but the shared rubric omitted an
  unchanged-layout baseline and rewarded a dedicated asset tree before native root filtering was
  tested. A real Samebase Worker later showed that the unchanged root was valid and failed only
  because it had no package manifest. Keep this run as a negative test for overfit evaluation. See
  `research/project-adoption/experiments/spiro-assets-only-guidance.md`.

## Last supervised legacy-static follow-up

- Date: 2026-08-16
- Targets: `nicu-chiciuc/impossible-object`, `nicu-chiciuc/fractal-circles`, and
  `nicu-chiciuc/triangle-image`
- Result: the migrations confirmed both sides of the build boundary. Checked-in browser files can
  use a no-op build, while Triangle Image must keep its existing Webpack build and `dist` output.
  Triangle Image also showed that a stale competing lock file can make Workers Builds select the
  wrong package manager. Fractal Circles showed that a clean package-manager install can generate an
  untracked build-policy file. The public guidance now requires provider-log proof for package
  manager selection and a clean working tree after installation.
- Command result: Samebase already stores build and deploy as separate trigger phases. Do not repeat
  the build inside the deploy scripts. Local `wrangler dev` is not part of repository adoption.
- Product gap: the dashboard can assign a vault to a personal folder, but the public Samebase MCP
  has no folder-state or folder-assignment action. The Triangle Image migration required browser
  control for that UI-only step.
- Evidence status: these are supervised migration findings, not a clean instruction-bundle score.

## Last focused legacy-build canary

- Date: 2026-08-16
- Installed plugin: `0.2.20`
- Candidate plugin: `0.2.21`
- Target: `nicu-chiciuc/elm-gears-challenge` at `360b6af53731226d8f762ac1dcd4f59c817d4df7`
- Result: neither bundle passed. The control kept the real Elm build but proposed trigger commands
  that do not match the Samebase command contract and selected an old build token. The candidate
  replaced a reproducible Elm build with a no-op, added more files, and used package-runner flag
  forwarding that made an unauthorized production deployment. Reject the candidate as tested.
- Decision: keep the real-build decision and direct provider validation as short high-priority
  rules. Remove the long pitfall list. Rerun the reduced candidate before release. See
  `research/project-adoption/experiments/elm-gears-legacy-build-guidance.md`.
- Reduced retest: partial pass. It made no provider call, used the three Samebase command names, and
  preserved operator token choice. It did not find the small Elm installer repair and proposed a
  generated artifact with extra package markers. Keep the short reusable rules. Do not add the
  project-specific Elm repair to the public plugin. Require independent manager evidence before an
  uncertain legacy build plan becomes a source write.
