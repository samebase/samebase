# Plugin review remediation, September 18, 2026

The rejection of version `0.2.34` named three problems: failed test cases, tool annotations that did
not match behavior, and returned user data not covered by the privacy notice. The email did not
identify individual tools or fields. The findings below are code defects or verified observations,
not a claim that OpenAI identified these exact causes.

## Test failure

The reviewer account called six tools, including two managed creation attempts. Both creation
attempts failed at the organization connection limit before a provisioning run was saved. The
organization had two complete apps using all six Free connections. The operator has since upgraded
the organization to Pro. This resolves that capacity condition only.

The September 5 evidence combined direct MCP calls and model routing checks. It did not establish
that the submitted tests passed in ChatGPT web and mobile. The public skill also required Codex's
in-app browser without a working alternative for those clients. Version `0.2.35` gives ChatGPT users
a clickable handoff link and only reports that the dashboard opened when a browser action did so.

## Annotations and descriptions

All 15 tools already supplied explicit booleans for the three required annotations.

- Authentication status, repository inventory, Convex discovery, and Worker discovery perform reads.
  Their read-only labels now match token listing. Routine authentication, token refresh, and usage
  bookkeeping are not the user-facing operation described by these tools.
- Workers Builds token listing is limited to the selected workspace's connected Cloudflare account.
  Its open-world flag is false.
- Feedback sends a user-approved email to a fixed Samebase mailbox. Its destructive flag is true
  because a delivered message cannot be recalled.
- Deploy-key rotation revokes recorded keys before creating replacements. The justification now
  states that order and the risk of temporarily losing build access.
- Infrastructure retry starts a fresh run that reuses attached resources and creates missing ones.
  When Cloudflare is requested, it configures Workers Builds and rotates deploy keys even for
  attached resources. It does not resume a saved failed step.

The [submission guide](https://developers.openai.com/plugins/deploy/submission#complete-the-form)
explicitly includes irreversible messages in destructive effects and distinguishes bounded private
accounts from open-world access. Its read-only wording also mentions logging without distinguishing
routine transport bookkeeping. The read-only classification above describes each tool's product
operation; the rejection email does not settle that interpretation.

## Returned data

The code audit found arbitrary exception messages at both MCP error boundaries, raw nested error
messages in Worker discovery, and internal provisioning/deletion run IDs that no MCP tool accepts.
These are unnecessary outputs. Repository and provider identifiers used by subsequent tools remain
necessary.

The existing privacy notice already covers account identity, connected-service metadata, tool
results, diagnostics, and the connected agent as a recipient. The audit did not establish a missing
category. Response minimization is the first correction; the public notice should not become a list
of implementation fields.

## Verification

- The privacy worker passed 85 focused tests and TypeScript checks before integration.
- The combined patch passed 65 focused MCP, error-boundary, catalog, authentication, and generated
  documentation tests in 1.60 seconds, plus `tsgo --noEmit`.
- `pnpm run dev --once` pushed the final functions to the local Convex deployment.
- Plugin manifest, formatting, and logo checks passed.
- Luna low and Sol low independently passed the focused mobile handoff routing prompt. These were
  planned calls, not executions in ChatGPT mobile.
- The generated submission contains 15 tools, five positive cases, and three negative cases.

The four acknowledgement-only tools still have no `outputSchema`: Workers Builds configuration,
Convex deploy-key rotation, infrastructure retry, and feedback submission. Their existing responses
contain plain confirmation text. This was not identified in the rejection, but structured
acknowledgements would let clients validate those results. See the
[MCP tool schema](https://modelcontextprotocol.io/specification/draft/server/tools#tool).

## Release evidence still required

- Deploy the corrected server and use the same final skill bundle in the submission.
- Scan the deployed tool catalog and verify the saved annotations and justifications.
- Run all five positive and three negative submitted cases in ChatGPT web and mobile with the
  reviewer account. Record actual outputs and handoff redemption separately for each client.
- Do not treat a local test pass, a model's planned tool sequence, or successful HTTP transport as
  proof that the reviewed workflow passed.

The submission portal was signed out during this investigation. No new review request was sent.

## Review work

Two read-only reviews checked annotations and privacy. The privacy reviewer then implemented its
bounded changes on `nicu-plugin-review-privacy-worker` in an isolated worktree. The main task owns
integration, submission text, public skill changes, and final verification on
`nicu-plugin-review-fixes`.

## October 1 review fixes

The [follow-up review](https://github.com/samebase/samebase/pull/1616#issuecomment-5930024719)
identified five improvements. Candidate plugin `0.2.40`, at commit `7a93dac99`, includes these
changes:

- Browser handoff metadata and MCP server instructions require a clickable returned link. They state
  that the link works once, expires after five minutes, and must remain private. A client without a
  browser action must not claim that it opened the dashboard. This rule does not depend on a
  packaged skill.
- MCP inventory no longer returns the stored `providerPlan`. For incomplete tokenless setup, it
  returns `pendingCloudflareSetup` with only the planned Worker name, root directory, and exact
  attached Convex project ID. The dashboard keeps its existing plan. The inventory test checks exact
  attachment selection, omission of historical token UUIDs, and null results when recovery does not
  apply.
- Creation case 4 now requires an available current last-used build token and sufficient reviewer
  organization capacity. Its expected result includes the private repository, Convex attachment,
  Worker attachment, Builds configuration, and requested production build. The prompt asks for setup
  status. Ready setup does not prove that the build succeeded or that the app is live.
- Authentication metadata calls the returned permission names "permissions". The existing
  `accessKeys` response field remains unchanged.
- Shared MCP instructions no longer include a Codex marketplace upgrade paragraph.

All 74 focused tests passed across seven MCP, runtime, error, catalog, authentication, handoff, and
generated-documentation test files. TypeScript, plugin checks, commit lint and format checks, and
local Convex setup and function deployment passed. Generated-action-doc verification passed after
the source and output were committed. No frontend preview was started.

Fresh GPT-6 Luna low and GPT-6.1 Sol low subjects read one frozen bundle of MCP server instructions
and generated action docs, without the packaged skill or expected results. The bundle SHA-256 was
`0aee950b12d2ce8ceac60404d8c355693c0566478bcdd113e4094d169956094f`. The exact submitted creation and
dashboard prompts were checked with synthetic tool results:

- Both selected `create_browser_handoff` directly, showed the returned clickable link, and did not
  claim that a browser opened.
- Sol produced valid creation arguments using the available last-used token, `private: true`, and
  `convexDeploymentRegion: "aws-us-east-1"`. It polled again while provider setup was running and
  reported ready setup separately from deployment success.
- Luna selected the correct token and sequence but wrote `cloudflareDeploymentRegion` in its first
  call text, then named the correct field in the same answer. After a simulated schema rejection, it
  used `convexDeploymentRegion` but kept placeholder names. It did poll again while provider setup
  was running and did not claim a live deployment. This was not a clean creation payload pass.

These were focused planned-call checks for two prompts. They did not create provider resources,
redeem a handoff, run the full eight-case suite, or execute ChatGPT web or mobile. The release
checks above remain required before resubmission. Two bounded review workers supplied metadata and
inventory changes; the main task integrated them on `nicu-plugin-review-fixes`.
