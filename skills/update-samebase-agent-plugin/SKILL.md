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
4. For every change under `packages/agent-plugins`, increase the version in its package manifest and
   both plugin manifests.
5. Run `pnpm run check:agent-plugins` and `pnpm --filter samebase verify:action-docs`.

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
