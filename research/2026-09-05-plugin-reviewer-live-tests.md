# Samebase plugin reviewer tests, 2026-09-05

## Scope

Tested plugin version `0.2.33` against the production MCP endpoint `https://api.samebase.com/mcp`.
The public skill came from commit `59855c2ab`, with SHA-256
`521b6917b60db51511071d242d3d8fcebd744a6d32df42ab3097505dbcd84034`.

The live calls used the dedicated reviewer account and a new OAuth client with PKCE. They did not
use the operator's existing Codex connection. The account password came from the saved submission.
Credentials and bearer tokens are not part of this record.

## Reviewer setup

- Enabled password sign-in and created the reviewer's password account through
  `authAdmin:createOrUpdatePasswordAccount` on production deployment `clear-butterfly-858`.
- Added the reviewer as a member of the existing `samebase-live-tests` organization. Its GitHub
  installation, Convex team, and Cloudflare account contain test resources.
- Confirmed password sign-in in Chrome, then approved all six requested MCP scopes.
- Replaced the obsolete `noter-guest` workspace in the creation test. Named the exact sample app
  `samebase-live-tests/tmp-my-cool-app2` in the Worker discovery test.

The saved marketplace instructions contain the login URL, workspace, credentials, sign-in steps, and
sample app. Keep this account, its membership, and the sample app available for later reviews.

## Results

| Case                       | Live result                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Account and permissions | Passed. Returned the reviewer email, member role, and six scopes without tokens or internal account IDs.                                                                                                                                 |
| 2. App inventory           | Passed. Returned the prepared sample app with source and provider setup ready.                                                                                                                                                           |
| 3. Worker discovery        | Passed. Used the sample app's stored Cloudflare account and returned its current Worker inventory. No Worker was attached or created.                                                                                                    |
| 4. Managed app creation    | Passed. Used the available last-used build token, created one private app in `aws-us-east-1`, and polled inventory until source and provider setup were ready. The first build failed; one same-commit retry passed, as described below. |
| 5. Browser handoff         | Passed. Opened the reviewer dashboard through a new handoff URL in Chrome. A browser signed in to another Samebase account correctly rejected a separate handoff.                                                                        |

The created repository is
[`samebase-live-tests/tmp-plugin-review-9806-20260905-1434`](https://github.com/samebase-live-tests/tmp-plugin-review-9806-20260905-1434).
The [deployed test app](https://tmp-plugin-review-9806-20260905-1434.rir.workers.dev/) returned HTTP
200 and rendered its Todo list page in Chrome. Its GitHub `check` and `supply-chain` checks passed.

The first Cloudflare build failed after the server bundle compiled. TanStack prerender could not
reach its local preview server: `ETIMEDOUT ::1:36845` and `ECONNREFUSED 127.0.0.1:36845`. The build
files matched the unchanged starter template. One retry of the same commit passed and deployed. No
code or build setting changed between the attempts.

- [Failed build](https://dash.cloudflare.com/a9dfbbd031cf9eda46831def8e468b4e/workers/services/view/tmp-plugin-review-9806-20260905-1434/production/builds/a7b54113-03df-4499-b06b-1e5568410ed2)
- [Successful retry](https://dash.cloudflare.com/a9dfbbd031cf9eda46831def8e468b4e/workers/services/view/tmp-plugin-review-9806-20260905-1434/production/builds/6322d2e9-f095-4d5b-875e-54705271da4d)

The public MCP endpoint returned HTTP 401 for an authentication-status call without a bearer token.
Password login is a separate prerequisite, not a signed-out MCP test.

## Model dispatch checks

Fresh GPT-5.6 Luna low and GPT-5.6 Sol low subjects received the same frozen public skill and live
tool descriptions, without expected calls or outputs. Both passed all eight original prompts. After
prompt corrections, both passed the account prompt, all three negative prompts, and the current
Worker discovery and creation prompts again.

The three negative prompts selected no Samebase tool: ordinary GitHub work, a provider deletion
question, and a standalone Cloudflare Worker request. These were model dispatch checks. No external
action was needed or run for a negative case.

The live creation test exercised the available last-used token branch. Empty-token, one-token, and
ambiguous-token behavior was checked through planned calls only. No account connections were removed
to force those branches.

## Marketplace draft

The OAuth scan returned all 15 tools after all six scopes were always requested. The current JSON
import applied five positive cases, three negative cases, and 15 tool justifications, with zero
missing, skipped, or mismatched entries. The `0.2.33` skill package passed its scan.
`cloudflare_listWorkersBuildTokens` remained read-only in the live catalog and marketplace form.

## Tool reference correction, 0.2.34

Commit `ff12f1238` replaces internal action IDs in agent-facing instructions with the exact callable
MCP names. The public skill, tool descriptions, parameter help, and generated action docs now use
the same names. No callable name, argument field, output field, title, or safety annotation changed.
A comparison against all 15 live `0.2.33` definitions passed after excluding description text.

Fresh Luna low and Sol low subjects passed all eight current reviewer prompts each using one frozen
candidate bundle. They received no expected calls or outputs. Each positive case selected the saved
tool sequence; the three negative cases selected no Samebase tool. These were planned-call checks,
so the live provider tests above were not repeated. One invalid harness attempt that prohibited
local bundle reads was discarded and rerun with a fresh subject.

The `0.2.34` skill SHA-256 is `06b26cf2235e96a71adc76addb3e6d07e24a902f5ccf3a76d4d09ff0c0517edc`.
Plugin checks, generated-doc verification, both documentation-generator tests, and all 41 MCP HTTP
tests passed. Two existing HTTP test expectations were updated to the corrected description text.
