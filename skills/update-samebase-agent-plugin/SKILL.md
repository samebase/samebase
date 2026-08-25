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
4. For every change under `packages/plugin`, increase the version in both plugin manifests.
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

- Date: 2026-08-25
- Artifact commit: `34739b392`
- Models: GPT-5.6 Luna low and GPT-5.6 Sol low
- Result: both models passed all eight cases. Each model selected the declared Samebase actions in
  the required order for connection status, app inventory, Worker discovery, managed app creation,
  and browser handoff. Each model used no Samebase action for ordinary GitHub work, a deletion
  question, or standalone Cloudflare work. Neither model opened a dashboard before user acceptance
  or used a URL other than the one-time browser handoff.

## Last focused feedback approval run

- Date: 2026-08-21
- Artifact commit: `55733aa33`
- Models: GPT-5.6 Luna low and GPT-5.6 Sol low
- Result: both models passed all seven focused trigger cases. For an unexpected Samebase failure and
  a wrong Samebase result with clear user frustration, each model showed one short exact report and
  the exact automatic-send approval sentence without calling the tool. After `Send it.`, each model
  called `samebase_feedback_submit` once with a report byte-for-byte equal to the shown report.
  After `No.`, neither model called the tool or repeated the offer, and each said that the report
  would not be sent. Normal missing authorization, a standalone Cloudflare failure, and ordinary
  Samebase success caused no feedback offer or call. All calls used the frozen local no-send mock.

## Last focused missing-action recovery run

- Date: 2026-08-25
- Artifact commit: `1a68e0a27`
- Models: GPT-5.6 Luna low and GPT-5.6 Sol low
- Result: both models passed five cases covering a missing Codex action, a callable authorization
  error, terminal Codex recovery, Claude Code, and ChatGPT. Missing actions caused one repair
  attempt through the current client. Only the callable authorization error caused an authorization
  offer. No model used another client's state or the public Samebase site.

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
