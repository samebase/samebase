# 093 Agent-Native One-Base Plan

## Document Control

- Status: Proposed
- Owner: Nicu Chiciuc
- Created: 2026-07-06
- Origin: operator strategy session converging three prior problem prompts (provisioning
  architecture, product wedge, action-contract catalog) into one direction; external reference is
  [BuilderIO/agent-native](https://github.com/BuilderIO/agent-native)
- Related rfcs: `rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md`,
  `rfcs/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md`,
  `rfcs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`,
  `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`, `rfcs/094_AGENT_ACTION_DOCS_REGISTRY_PLAN.md`
  (guide layer; see its relationship section)
- Related specs: `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`,
  `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`,
  `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`,
  `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`,
  `specs/035_LANDING_SLOGAN_SOURCE_AND_SELECTION_SPEC.md`,
  `specs/088_LANDING_README_PREVIEW_SPEC.md`
- Related research: `research/2026-07-02-landing-copy-interview.md`,
  `research/2026-07-02-landing-copy-receipts.md`,
  `research/2026-05-18-convex-native-ai-app-builder-competitors.md`,
  `research/2026-06-25-noter-guest-create-app-manual-test.md`,
  `research/2026-07-06-samebase-pitch-language.md`,
  `research/2026-07-06-stack-decision-rationale-interview.md`,
  `research/2026-07-14-agent-native-positioning-and-competitor-eval.md`

## Thesis

Samebase begins with one product conviction:

> The best default way to build a web app today is code in a GitHub repository the user owns, Convex
> for the backend, and Cloudflare Workers for delivery.

That conviction compounds across apps. Once a team has found the best default inside its fit,
unnecessary stack variation creates maintenance without adding product value. Samebase lets the
coding agent the user already chose create, connect, observe, and repair the same base across many
apps, so the fifth or tenth app does not become a fifth or tenth operational system.

The control plane is the scaling mechanism, not a separate provider-agnostic thesis. The canonical
state model, action contracts, inventory, and repair state keep the preferred base repeatable and
truthful across every app the user connects. Existing repositories and partial stacks are adoption
paths: a repository can remain GitHub-only, then attach Convex and Cloudflare later. Full value
appears when apps converge on the complete base.

"One base" therefore has two related meanings:

1. **The product base:** GitHub, Convex, and Cloudflare, reused across apps.
2. **The contract base:** one canonical description of Samebase's state (nouns), operations (verbs),
   and conviction (story), with coding agents as primary readers.

The three recurring implementation problems follow from that product direction:

1. **Provisioning drift:** create-app, import, manual worker attach, manual Convex attach, build
   wiring, deploy keys, retry, and cleanup grew separate paths because each surface re-described the
   same operations independently.
2. **Contract drift risk:** Convex validators, MCP tool schemas, UI copy, plugin docs, and public
   docs diverge when they each describe Samebase's actions independently.
3. **The landing page problem:** a greenfield-provisioning slogan does not explain why one proven
   base across several apps reduces long-term maintenance, or why Samebase adds value to a coding
   agent the user already likes.

The contract base makes every surface a renderer of the same product truth: dashboard UI, MCP tools,
public docs, the landing page, and plugins.

The internal landing interview stated the agent-native position in its own words
(`research/2026-07-02-landing-copy-interview.md:42`): "The app doesn't act like a wrapper around any
AI tool. It acts like a tool that you can use inside your AI tool." This plan extends that stance
from the app to the _marketing itself_: the landing page's job is to hand the visitor's agent a URL,
because an agent can evaluate receipts better than a hero section can persuade a human.

## What Already Exists (Do Not Rebuild)

The repo has been converging on this design for months. Much of the original plan has now shipped.

| Capability                                            | Where                                                                                                                                                        | Current state                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared provisioning blocks and durable provider state | `apps/samebase/convex/appProvisioningWorkflow.ts`, `vaultConvexDeployments`, `vaultCloudflareWorkers`                                                        | Create, attach, wire, verify, retry, ownership fencing, and run history are live                                                                                 |
| Full action-contract catalog and generated agent docs | `apps/samebase/convex/vault/contracts/`, `apps/samebase/scripts/generate-action-docs.ts`                                                                     | MCP tools, action docs, `/llms.txt`, and submission metadata are generated from the contracts                                                                    |
| Agent-queryable inventory and remedies                | `getUserVaults` in `apps/samebase/convex/vault/contracts/getUserVaults.ts:210`                                                                               | Every connected app returns roots, provider resources, coordinates, state, and provider/connection `nextAction`; failed `sourceSetup` is the remaining exception |
| Existing-repository adoption                          | `connectRepositoryContract` in `apps/samebase/convex/vault/contracts/connectRepository.ts:12`                                                                | Any readable GitHub repo can be registered without touching Convex or Cloudflare, remain GitHub-only, or attach providers later                                  |
| Monorepo app roots                                    | `vaultApps` in `apps/samebase/convex/schema.ts:469`, `VaultDashboardAppRootDialog` in `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx:1125` | Several deployable roots per repo are supported in the dashboard and provider records; no MCP action creates roots yet                                           |
| Public agent-readable corpus                          | `/landing-preview`, `/docs/*`, `/pricing.md`, `/llms.txt`                                                                                                    | Public, prerendered or raw-served, and indexed from `/llms.txt`                                                                                                  |
| MCP OAuth and pre-account direction                   | `apps/samebase/convex/mcp/`, `rfcs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`                                                                               | OAuth, PKCE, dynamic client registration, and browser handoff are live; the earlier pre-account flow remains prior art                                           |

What does **not** exist yet: public CLONK or Conductor comparison pages, MCP creation of monorepo
app roots, automatic discovery of an entire GitHub account, or fleet-wide base versioning and drift
repair.

## The Invariant: One Contract Per Action

The permanent target and forward rule is the "same-UI test": if the dashboard disappeared, an agent
holding only the contracts could still operate everything. Dashboard-only monorepo app-root creation
is the current exception and requires a future contract before it passes this test.

1. Every operational action exists as exactly **one contract module** colocated with its Convex
   function. The contract owns access, arguments, returns, MCP metadata, and the markdown doc body.
2. Everything else is a renderer: the Convex function registration, the MCP tool catalog entry, the
   exported `/docs/actions/<name>.md` page, `/llms.txt`, plugin docs, and
   `chatgpt-app-submission.json`.
3. No new operational UI button without a contract; no MCP tool without a contract; action docs are
   never hand-written. The existing app-root exception cannot expand to another UI-only action.
4. Status names its own remedy: degraded provider and connection states carry `nextAction`, whose
   value is a bare action id. The enclosing app and app root supply positional context;
   target-selection arguments come from discovery reads. Failed `sourceSetup` is the one remaining
   exception and exposes its message without `nextAction`.

Tool-name string literals scattered through `usageAttribution.ts` and tests should import
`contract.mcp.name` as part of the same consolidation.

## The API Boundary: Wrap The Join, Not The Providers

An agent that can run `gh`, `wrangler`, and `npx convex` already has near-total provider coverage,
and the providers ship their own MCP servers. Samebase cannot and should not compete on breadth: a
wrapper that chases provider API surface is permanently behind and permanently thin. The boundary
rule:

**Samebase wraps an operation only when at least one of these holds:**

1. It spans more than one provider in a single transaction (`createRepository`,
   `configure_workers_builds_for_github`, `rotate_convex_deploy_keys_for_workers_builds`).
2. It must update the durable registry to stay truthful (attach, import, retry). The record that
   "this repo + this deployment + this Worker + these triggers + these keys are one app, currently
   in state X" is the thing no provider console or CLI session holds: provider tools have 100%
   coverage and 0% shared state.
3. It encodes a learned failure mode. The rfcs/090 blocks are crystallized debugging: wrong-repo
   trigger adoption, preview key naming, mega-step partial states. A visiting agent freestyling the
   same steps with raw provider tools is the pre-090 world again, with its mistakes landing in the
   registry as stale state.

Routine provider-native operations such as logs, env vars, migrations, custom domains,
D1/queues/crons, and provider-specific debugging are deliberately not wrapped. Samebase does wrap
the cross-provider and registry repair actions listed above. Breadth is served by the other two legs
of the design:

- **Rich nouns**: `getUserVaults` already returns every coordinate an agent needs to go direct
  (deployment names, team/project slugs, `workers.dev` URLs, provider dashboard URLs). The status
  noun is the hand-off payload.
- **Taught referrals**: corpus docs under `/docs/operate/*` give the exact provider-direct recipe
  against those coordinates ("tail production logs: `npx convex logs --prod` for deployment
  `<deploymentName>`"), and recommend the official provider MCP servers and CLIs by name. This is
  the no-account philosophy applied to the API: where knowledge suffices, ship knowledge, not a
  wrapper, and an agent evaluating Samebase reads the referrals as an anti-lock-in receipt.

Two structural facts make the thin verb surface safe rather than limiting:

- **The verbs are already built.** The 090 blocks exist because the product needs them (dashboard
  provisioning, repair buttons, retry, fencing, event log). MCP exposure of a block is a contract
  file, not new provisioning code; "how much to expose" is a copy decision, not an engineering
  program.
- **GitHub is the broad adoption boundary.** `connect_existing_repository` records any readable
  GitHub repository without touching its providers. It can remain useful as a GitHub-only Samebase
  app, or supported Convex and Cloudflare resources can attach later through the specs 105/106
  flows. Other infrastructure remains provider-direct and outside Samebase's durable provider model.
  Several app roots can share one repository, but root creation is dashboard-only today.

The wrapped verbs also stay irreplaceable for one reason no CLI teaching can fix:
credentials-anywhere. Provider-direct requires provider credentials on the local machine; Samebase
holds OAuth grants server-side, so the same verbs work from ChatGPT, a phone, or a fresh CI job with
one Samebase auth, under single-owner fencing across providers.

The live MCP catalog stays small: authentication and status, create and import, provider discovery,
attach, wire, verify, retry, and browser handoff. `/llms.txt` is the generated authoritative list.
The provider discovery reads are necessary because an agent cannot safely supply attach targets
without them. Contract ids are snake_case action names and form the documented action vocabulary;
implementation-specific function names stay behind the contracts.

## The Front Door: Directed Retrieval, Not Ambient SEO

The landing concept, "ask your coding agent about samebase.com," is supported by evidence in its
_directed_ form and refuted in its _ambient_ form. Ahrefs' May 2026 study of 137k domains found 97%
of published `llms.txt` files received zero requests, and AI crawlers do not probe for the file
uninvited. Developer agents explicitly handed a URL fetch it reliably. The strategy is therefore:
**the human hands their agent the URL.** The hero makes that hand-off effortless.

Recommended hero prompt (one exact recommendation, replacing the rotating slogan from spec 035):

> **Don't take our word for it.** Paste this into Claude Code, Codex, or Cursor:
>
> `Read https://samebase.com. I build and maintain several apps with you. Should I use Samebase, or should you manage GitHub, Convex, and Cloudflare directly for each one? Choose one, and tell me when the other would be better.`

This compact question tests the compound product: Samebase plus the coding agent the user already
likes, against the most diagnostic alternative: having that agent operate each provider directly.
CLONK is the first named competitor in the acceptance panel. The shorter natural Lovable question
remains a calibration probe, not a forced Samebase win.

Below the fold stays minimal, in this order:

1. the best-stack conviction;
2. the starter's core workflow runs natively on macOS, Linux, and Windows because repository
   automation is TypeScript run by Node 24 rather than Bash;
3. why repeating the base reduces maintenance across several apps;
4. Samebase works inside the user's chosen coding-agent interface;
5. start new or connect an existing repository;
6. begin GitHub-only, then attach Convex and Cloudflare later;
7. connected-app inventory, monorepo roots, verification, and repair; and
8. provider ownership and the Leaving Test.

Delivery is one requirement with three renderings, in priority order. The requirement: every corpus
page (and the landing itself) must deliver its full content in a single unauthenticated fetch, with
no JavaScript execution, and read clean after text extraction.

1. **Prerendered semantic HTML is the foundation, and it already exists.** All `access_public`
   concrete routes are prerendered to static HTML at build time
   (`apps/samebase/dev/publicPrerenderPages.ts`); the corpus lives on `/`, `/landing-preview`,
   `/pricing`, and `/docs/*` among them. Agent fetchers convert HTML to text, and the app's plain
   markup extracts cleanly. This is why the hero prompt points at `samebase.com` itself rather than
   a machine-only file, and why the remaining work is content, not plumbing.
2. **Raw markdown as a near-free add-on.** Corpus pages authored as markdown also ship as static
   `.md` assets. The overview is JSX and has no `.md` variant. These are token-cheap fetches and
   byte-deterministic content for the eval harness and demo video. `Accept: text/markdown` content
   negotiation with `Vary: Accept` ([acceptmarkdown.com](https://acceptmarkdown.com)) is
   deliberately not implemented yet; it is the follow-up shape, not shipped behavior. An
   optimization, not the strategy.
3. **`/llms.txt` as the index.** One llmstxt.org-format file lists the corpus and generated action
   docs. `apps/samebase/scripts/generate-action-docs.ts` emits it from the catalog. It remains
   convention compliance, not the retrieval strategy.

The agent-facing corpus behind that URL:

- **The conviction with receipts:** the stack argument carrying source links and retrieved-on dates:
  Workers static assets free on every plan; Cloudflare's own "start on Workers, not Pages" guidance;
  Convex's database-only-via-functions architecture quoted from Convex's docs; the Firebase/Supabase
  exposure record (CVE-2025-48757 attributed to researcher Matt Palmer, stated with the
  vendor-disputed caveat); Netlify's 15-credits-per-production-deploy arithmetic. All precision
  fixes from `research/2026-07-02-landing-copy-receipts.md` are binding: "production deploys" not
  "commits"; TanStack Start is an RC, not stable; unverifiable claims (Convex project counts) do not
  ship. The private absolutist phrasing ("if you're not using Convex, your app is a security risk")
  stays private; the published version is the architecture argument plus the breach record.
- **The no-account recipe:** the honest do-it-yourself path: create the same stack with `npx`,
  Convex, and wrangler, paying providers directly, no Samebase account. Ends with what the account
  adds (one-action provisioning, previews, repair actions, phone dashboard). This is the trust
  lever: an agent reading a vendor page that says "here is how to get this without us" will weight
  everything else on the page higher.
- **The Leaving Test page:** ownership receipts: code in the user's GitHub, their Convex team, their
  Cloudflare account; delete the Samebase account and the app keeps running. This leads comparisons
  with hosted builders. It is not the primary distinction from agent workspaces that also use
  user-owned repositories.
- **Comparison docs that name names:** CLONK first, because it has the strongest overlap with "use
  Claude or Codex you already pay for." Conductor is the control for users who want an agent
  cockpit. Lovable is the nontechnical rapid-prototype boundary. Direct Claude or Codex operation is
  the most diagnostic question but needs no competitor page because the do-it-yourself path already
  represents it. cto.new and the recurring watch remain rotating research comparisons. Each public
  comparison must say when the other product is better.

## Marketing As CI: The Eval Harness

If the landing page is a prompt, its correctness is testable. The gate measures product
reconstruction and calibrated reversal, not Samebase recommendation rate.

- **Question panel:** short pairwise prompts compare Samebase with direct agent operation, CLONK,
  Conductor, and Lovable. Each positive case has a reversal where the other choice should win. The
  panel is versioned in `research/2026-07-06-agent-landing-eval-questions.md`.
- **Runner:** fresh `claude -p` and `codex exec` sessions with web access, each in a new non-Git
  temporary directory with no repository context, inherited MCP connections, or project plugins. Run
  low effort first, then use higher effort to diagnose rather than erase a failure. Inspect only
  visible messages, tool events, and final answers; hidden chain-of-thought is unavailable.
- **Rubric:** retrieval, reconstruction, factual accuracy, category accuracy, decision calibration,
  and fairness. A correct choice based on invented capabilities fails. Competitors must win when the
  stated scenario fits them better.
- **Claims CI:** re-fetch every receipt's source URL and alert when a quoted price or statement
  disappears. A claim that rots gets deleted, not softened.

## Phases

Phase 1: **Corpus and positioning** (current preview slice):

- The overview, stack guide, no-account recipe, receipts ledger, public pricing, raw markdown, and
  `/llms.txt` already exist.
- This positioning revision intentionally keeps one testable decision in one preview PR: the
  research synthesis, RFC correction, revised eval panel, `/landing-preview` overview copy, and the
  generated `/llms.txt` introduction. Separating the public copy would make the research impossible
  to test against its own deployed artifact.
- Run the positioning panel against the exact PR preview origin, including that origin's
  `/llms.txt`. Fix the corpus until both agents reconstruct it accurately and reverse fairly.
- A later `/docs/decisions` page can record each stack decision as context, decision, dated
  validating events, commitment tier, and revert condition. Receipts stay facts-only.

Phase 2: **Catalog** (substantially shipped):

- The action contracts, MCP catalog, generated action docs, generated `/llms.txt`, provider and
  connection `nextAction` values, existing-repository action, attach and wire actions, verification,
  retry, and the first provider-direct operate guides are live.
- Remaining catalog work is incremental: give failed `sourceSetup` an explicit remedy and extend
  guide coverage when a repeated day-2 need is proven.
- An MCP action for creating monorepo app roots is separate future scope. The current dashboard
  capability must not be described as agent-operable until that contract exists.

Phase 3: **Homepage promotion** (depends on the preview eval passing):

- Promote the accepted overview thesis and fixed paste-able prompt to `/`, superseding the spec 035
  slogan rotation. Amend the accepted landing contract in the same change and retain screenshot
  coverage.
- Record a fresh agent answering the pairwise comparison live against production.
- Record the full proof loop: an agent reads the corpus, connects MCP, creates an app, reports the
  `workers.dev` URL, and the operator deletes the Samebase account while the app keeps serving.

Phase 4: **Agent onboarding loop** (mostly documentation; MCP OAuth and DCR are live):

- Keep the MCP connect flow easy to discover from the corpus and `/llms.txt`.
- Keep rfcs/063's pre-account direction. Agent account creation stays scoped to claimed-token
  issuance after human approval; full account CRUD by agents is out.

## Non-Goals

- No in-app AI chat builder; Samebase remains a tool used _inside_ the user's AI tool.
- No human-persuasion marketing surface beyond the single hero screen.
- No ambient-SEO/AEO strategy claims; if general assistants pick the corpus up, that is a bonus.
- No destructive actions (vault deletion, preview cleanup) over MCP until the rfcs/085 access model
  carries an explicit approval step for them.
- No day-2 provider wrappers over MCP: logs, env vars, migrations, domains stay provider-direct,
  taught by `/docs/operate/*` with coordinates from `getUserVaults`. Samebase MCP is complementary
  to the official Convex/Cloudflare/GitHub MCP servers and CLIs, never a substitute for them.
- No multi-provider hedging in the story: Cloudflare is the answer for delivery, Convex for the
  backend; alternatives appear only inside comparison docs.
- No fleet-wide base versioning, drift detection, or automated cross-app upgrade pull requests in
  this RFC. Those remain a separate product hypothesis.
- No live mutation of production copy during an active eval. Each clarification gets a new preview
  deployment and the same prompt is rerun against its URL.

## Risks

- **Stale-model answers**: an agent that answers without fetching embarrasses the hero. Mitigated by
  embedding the URL in the prompt, and measured by the eval harness before the landing ships.
- **Claims rot**: dated receipts plus claims CI; the kill rule is delete-not-soften.
- **State lies amplified**: an agent repeating a wrong dashboard state is worse than a human seeing
  it, because it repeats it confidently and acts on it. Provider and connection remedies are live;
  failed source setup remains the known exception. The Cloudflare build-variables dashboard gap
  (`research/2026-05-16-cloudflare-workers-build-preview-env-ui-gap.md`) stays monitored as a
  Cloudflare-side limitation affecting only manually-managed setups.
- **Category confusion**: models currently reduce Samebase to a greenfield generator or confuse it
  with an agent workspace. Mitigate with explicit existing-repository, GitHub-only, inventory, and
  monorepo facts, plus paired tests where CLONK and Conductor should win.
- **Copyability**: any competitor can publish an `llms.txt`. The stronger proof is generated action
  contracts the product executes, a truthful inventory and repair model, the no-account recipe, and
  a filmed Leaving Test.
- **Freestyling agents bypass the verbs**: an agent may provision with raw provider tools anyway,
  leaving the registry blind. Absorbed rather than fought: the attach/import funnel reconciles
  external infrastructure back into the record, and the corpus positions the verbs by their real
  advantages (fenced, recorded, credential-less surfaces) instead of pretending direct usage is
  wrong.
- **Eval overfitting**: preserve stable pairwise decisions and reversals, then rotate friend
  framing, lifecycle, agent identity, effort, and the competitor-watch target. Keep one hostile
  question.

## Decisions And Open Questions

1. Eval transcripts stay internal in `research/` for now. Preserve exact prompts, settings,
   isolation, decisions, and factual errors with sanitized excerpts, not raw event logs or private
   paths. Reconsider publication after two clean rounds.
2. Comparison order is resolved: CLONK first named comparison; direct agent operation as the core
   diagnostic; Conductor as the cockpit control; Lovable as the rapid-prototype boundary; cto.new
   and the recurring watch as rotating research targets.
3. Docs origin is resolved: same-origin `samebase.com/docs/*` plus `/llms.txt`.
4. Should dashboard UI copy literally render `contract.description` in Phase 2, or only share
   names + `nextAction`? Recommendation: names + `nextAction` only; sharing prose copy can wait
   until a real divergence hurts.
5. Does the status noun grow a per-vault run/event history query (agent-readable provisioning log)
   in Phase 2? Recommendation: later; `nextAction` plus current run state covers the operate loop.
6. Should Samebase eventually track base versions, detect drift, and coordinate upgrade pull
   requests across several apps? Recommendation: research separately after the current positioning
   proves that users value fleet standardization. Do not expand this RFC's implementation scope.

## Validation

- Positioning preview: both Claude and Codex at low effort run the full pairwise panel from isolated
  non-Git directories against the deployed preview. No local leakage or rubric hard failure. A
  higher-effort rerun diagnoses a miss but does not erase it.
- Generated corpus: `/docs/actions/*.md`, `/llms.txt`, and `chatgpt-app-submission.json` remain
  byte-identical to catalog output.
- Landing overview: focused assertions plus canonical `pnpm test:visual:linux` screenshot coverage.
- Homepage promotion: only after the preview matrix passes with factual reconstruction and the
  expected reversals.
