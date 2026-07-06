# 111 Agent-Native One-Base Plan

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
  `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
- Related specs: `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`,
  `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`,
  `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`,
  `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`,
  `specs/035_LANDING_SLOGAN_SOURCE_AND_SELECTION_SPEC.md`,
  `specs/088_LANDING_README_PREVIEW_SPEC.md`
- Related research: `research/2026-07-02-landing-copy-interview.md`,
  `research/2026-07-02-landing-copy-receipts.md`,
  `research/2026-05-18-convex-native-ai-app-builder-competitors.md`,
  `research/2026-06-25-noter-guest-create-app-manual-test.md`

## Thesis

The three hardest recurring problems in this project are the same problem wearing three costumes:

1. **Provisioning drift** — create-app, import, manual worker attach, manual Convex attach, builds
   wiring, deploy keys, retry, and cleanup grew separate paths because each surface re-described the
   same operations independently.
2. **Contract drift risk** — Convex validators, MCP tool schemas, UI copy, plugin docs, and public
   docs each want their own copy of "what you can do with Samebase" and will diverge unless one
   source feeds all of them.
3. **The landing page problem** — explaining to a human in one screen why Convex + Cloudflare
   Workers beats Lovable-style builders is hard, because the honest argument is a pile of receipts,
   not a slogan.

The shared root: Samebase has never had **one base** — a single canonical description of its state
model (nouns), its operations (verbs), and its conviction (story). This plan makes that base
explicit and makes **coding agents the primary readers of it**. Every other surface — dashboard UI,
MCP tools, public docs, the landing page, plugins — becomes a renderer of the same base.

The product framing follows directly. Samebase's actual product is a conviction made operable:

> The best default way to build a web app today is Convex for the backend plus Cloudflare Workers
> for delivery, with the code in a GitHub repo the user owns. Samebase is everything around that
> conviction: the receipts that justify it, the control plane that provisions it in one action, and
> a phone-friendly dashboard to watch it.

The internal landing interview already stated the agent-native position before the term arrived
(`research/2026-07-02-landing-copy-interview.md:42`): "The app doesn't act like a wrapper around any
AI tool. It acts like a tool that you can use inside your AI tool." This plan extends that stance
from the app to the _marketing itself_: the landing page's job is to hand the visitor's agent a URL,
because an agent can evaluate receipts better than a hero section can persuade a human.

## What Already Exists (Do Not Rebuild)

The repo has been converging on this design for months. The plan below is mostly composition, not
construction.

| Capability                                                                                                                                                        | Where                                                                                                    | Status                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Durable per-provider state blocks (`source_setup`, `attach_convex`, `attach_worker`, `wire_builds`, `wire_convex_build_access`), ownership fencing, run/event log | `apps/samebase/convex/appProvisioningWorkflow.ts`, `vaultConvexDeployments`, `vaultCloudflareWorkers`    | Landed — all 5 phases of rfcs/090 shipped (v1645–v1648)                                            |
| Entry-path convergence: create, manual attach, dashboard repairs, retry all run the same blocks                                                                   | `runComposedInfrastructure` (`apps/samebase/convex/appProvisioningWorkflow.ts:712-786`)                  | Landed; import leaves providers `not_configured` by design (spec 096); cleanup is a parallel model |
| Per-action contract objects: access + args + returns + MCP name/description/safety colocated with the function                                                    | `apps/samebase/convex/vault/createRepositoryContract.ts`, `.../getUserVaultsContract.ts`                 | Live for 2 actions; rfcs/089 status line is stale (says Draft, is implemented)                     |
| Convex validator → JSON Schema derivation for MCP tools                                                                                                           | `apps/samebase/convex/toolRuntime/convexSchemas.ts:111-134`                                              | Live                                                                                               |
| MCP server with OAuth + PKCE + dynamic client registration, scopes = `access_*` keys                                                                              | `apps/samebase/convex/mcp/http.ts`, `apps/samebase/convex/mcp/protocol.ts`                               | Live (this plan was partly researched through it)                                                  |
| Agent-queryable status object per vault (`sourceSetup`, `providerSetup`, per-worker connection + key states)                                                      | `getUserVaults` (`apps/samebase/convex/vault/dashboard.ts:919-927`), MCP `vault_dashboard_getUserVaults` | Live; missing an explicit `nextAction` field                                                       |
| Receipts corpus with source links and precision caveats                                                                                                           | `research/2026-07-02-landing-copy-receipts.md`                                                           | Researched, unshipped                                                                              |
| Public docs routes                                                                                                                                                | `/docs/the-stack`, `/docs/do-it-yourself`, `/pricing`                                                    | Exist; not yet markdown-first or llms.txt-indexed                                                  |
| Pre-account MCP onboarding flow                                                                                                                                   | `rfcs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`                                                        | Prior art for agent-initiated signup                                                               |

What does **not** exist anywhere yet: `llms.txt`, raw-markdown doc serving, generated action docs,
comparison pages, or any agent-facing marketing surface. That is the greenfield.

## The Invariant: One Contract Per Action

The permanent rule this plan installs (the "same-UI test": if the dashboard disappeared, an agent
holding only the contracts could still operate everything):

1. Every operational action exists as exactly **one contract module** colocated with its Convex
   function — the existing `createRepositoryContract.ts` shape, extended with a markdown doc body
   (what it does, preconditions, failure modes, what it costs).
2. Everything else is a renderer: the Convex function registration, the MCP tool catalog entry, the
   exported `/docs/actions/<name>.md` page, plugin docs, and `chatgpt-app-submission.json` (which
   becomes a generated file; today it is a hand-maintained third copy that rfcs/089 itself flags as
   a sync hazard).
3. No new operational UI button without a contract; no MCP tool without a contract; action docs are
   never hand-written.
4. Status must name its own remedy: `getUserVaults` grows a `nextAction` field per degraded state,
   whose value is a contract name. Dashboard repair buttons and agent suggestions read the same
   field, so "what is wrong and which action fixes it" has one answer for humans and agents.

Tool-name string literals scattered through `usageAttribution.ts` and tests should import
`contract.mcp.name` as part of the same consolidation.

## The API Boundary: Wrap The Join, Not The Providers

An agent that can run `gh`, `wrangler`, and `npx convex` already has near-total provider coverage,
and the providers ship their own MCP servers. Samebase cannot and should not compete on breadth — a
wrapper that chases provider API surface is permanently behind and permanently thin. The boundary
rule:

**Samebase wraps an operation only when at least one of these holds:**

1. It spans more than one provider in a single transaction (`createRepository`, `wire_builds`,
   `wire_convex_build_access`).
2. It must update the durable registry to stay truthful (attach, import, retry). The record that
   "this repo + this deployment + this Worker + these triggers + these keys are one app, currently
   in state X" is the thing no provider console or CLI session holds — provider tools have 100%
   coverage and 0% shared state.
3. It encodes a learned failure mode. The rfcs/090 blocks are crystallized debugging — wrong-repo
   trigger adoption, preview key naming, mega-step partial states. A visiting agent freestyling the
   same steps with raw provider tools is the pre-090 world again, with its mistakes landing in the
   registry as stale state.

Everything else — logs, env vars, migrations, custom domains, D1/queues/crons, all day-2 operations
— is deliberately never wrapped. Breadth is served by the other two legs of the design:

- **Rich nouns**: `getUserVaults` already returns every coordinate an agent needs to go direct
  (deployment names, team/project slugs, `workers.dev` URLs, provider dashboard URLs). The status
  noun is the hand-off payload.
- **Taught referrals**: corpus docs under `/docs/operate/*` give the exact provider-direct recipe
  against those coordinates ("tail production logs: `npx convex logs --prod` for deployment
  `<deploymentName>`"), and recommend the official provider MCP servers and CLIs by name. This is
  the no-account philosophy applied to the API: where knowledge suffices, ship knowledge, not a
  wrapper — and an agent evaluating Samebase reads the referrals as an anti-lock-in receipt.

Two structural facts make the thin verb surface safe rather than limiting:

- **The verbs are already built.** The 090 blocks exist because the product needs them (dashboard
  provisioning, repair buttons, retry, fencing, event log). MCP exposure of a block is a contract
  file, not new provisioning code — "how much to expose" is a copy decision, not an engineering
  program.
- **Adoption is the escape hatch.** Whatever users or agents build outside the opinionated default,
  the specs 105/106 manual-attach flows import back into the registry. Opinionated composition out,
  universal adoption in: variation never forks the record.

The wrapped verbs also stay irreplaceable for one reason no CLI teaching can fix:
credentials-anywhere. Provider-direct requires provider credentials on the local machine; Samebase
holds OAuth grants server-side, so the same verbs work from ChatGPT, a phone, or a fresh CI job with
one Samebase auth, under single-owner fencing across providers.

The v1 MCP catalog is therefore exactly the dashboard's operational buttons, nothing more: the
status noun `getUserVaults` (+ `nextAction`), and the verbs `createRepository`,
`connectExistingRepository`, `connect_convex_deployment`, `connect_cloudflare_worker`,
`wire_builds`, `wire_convex_build_access`, `retry`. Roughly eight tools — small enough that tool
choice stays reliable, and identical by construction to what a human sees.

## The Front Door: Directed Retrieval, Not Ambient SEO

The landing concept — "ask your coding agent about samebase.com" — is supported by evidence in its
_directed_ form and refuted in its _ambient_ form. Ahrefs' May 2026 study of 137k domains found 97%
of published `llms.txt` files received zero requests, and AI crawlers do not probe for the file
uninvited; but developer agents that are explicitly handed a URL (Claude Code, Codex, Cursor) fetch
it reliably. So the strategy is: **the human hands their agent the URL.** The hero's job is to make
that hand-off effortless, not to persuade.

Recommended hero (one exact recommendation, replacing the rotating slogan from spec 035):

> **Don't take our word for it.** Paste this into Claude Code, Codex, or Cursor:
>
> `Read https://samebase.com and tell me whether my next app should start on Samebase.`

Second CTA: connect the MCP server now. Third: plain sign-in. Below the fold stays close to today's
minimalism — the thesis paragraph, the Leaving Test, and links into the corpus for humans who read.

Delivery is one requirement with three renderings, in priority order. The requirement: every corpus
page (and the landing itself) must deliver its full content in a single unauthenticated fetch, with
no JavaScript execution, and read clean after text extraction.

1. **Prerendered semantic HTML is the foundation, and it already exists.** Every `access_public`
   concrete route — `/`, `/docs/*`, `/pricing` — is prerendered to static HTML at build time
   (`apps/samebase/dev/publicPrerenderPages.ts`). Agent fetchers convert HTML to text, and the app's
   deliberately plain rectangular markup extracts cleanly. This is why the hero prompt points at
   `samebase.com` itself rather than a machine-only file, and why Phase 1 is a content problem, not
   a plumbing problem.
2. **Raw markdown as a near-free add-on.** Corpus pages are authored (or generated from contracts)
   as markdown, so also serving each page as `.md` — and honoring `Accept: text/markdown` content
   negotiation with `Vary: Accept` ([acceptmarkdown.com](https://acceptmarkdown.com)) — costs little
   and buys token-cheap fetches plus byte-deterministic content for the eval harness and the demo
   video. An optimization, not the strategy.
3. **`/llms.txt` as the generated index.** One llmstxt.org-format file listing the corpus, emitted
   from the catalog. Kept because it is free and some tools look for it — convention compliance,
   demoted from strategy.

The agent-facing corpus behind that URL:

- **The conviction with receipts** — the stack argument carrying source links and retrieved-on
  dates: Workers static assets free on every plan; Cloudflare's own "start on Workers, not Pages"
  guidance; Convex's database-only-via-functions architecture quoted from Convex's docs; the
  Firebase/Supabase exposure record (CVE-2025-48757 attributed to researcher Matt Palmer, stated
  with the vendor-disputed caveat); Netlify's 15-credits-per-production-deploy arithmetic. All
  precision fixes from `research/2026-07-02-landing-copy-receipts.md` are binding: "production
  deploys" not "commits"; TanStack Start is an RC, not stable; unverifiable claims (Convex project
  counts) do not ship. The private absolutist phrasing ("if you're not using Convex, your app is a
  security risk") stays private; the published version is the architecture argument plus the breach
  record.
- **The no-account recipe** — the honest do-it-yourself path: create the same stack with `npx`,
  Convex, and wrangler, paying providers directly, no Samebase account. Ends with what the account
  adds (one-action provisioning, previews, repair actions, phone dashboard). This is the trust
  lever: an agent reading a vendor page that says "here is how to get this without us" will weight
  everything else on the page higher.
- **The Leaving Test page** — ownership receipts: code in the user's GitHub, their Convex team,
  their Cloudflare account; delete the Samebase account and the app keeps running. This is the claim
  walled-garden competitors structurally cannot publish, so it leads the comparison story.
- **Comparison docs that name names** — Lovable first (largest recognition, receipted security
  contrast), then cto.new (closest stack bet). Each includes a "when they are the better choice"
  section; an agent will check fairness, and fairness is what makes the recommendation credible. Per
  repo rule, Samebase-authored copy never uses Vercel as an example provider; stack comparisons use
  Netlify for the hosting-pricing contrast.

## Marketing As CI: The Eval Harness

If the landing page is a prompt, its correctness is testable. Treat the corpus like code:

- **Question panel** (~8 questions, versioned in `research/`): "Should I use samebase.com or
  lovable.dev?", "What is the cheapest way to host a Convex app?", "Can my coding agent create the
  app for me?", "Do I need a Samebase account?", "Why should I NOT use Samebase?" (hostile question
  included on purpose).
- **Runner**: fresh `claude -p` and `codex exec` sessions with web access, each given one question
  plus the URL. Start manual — one round of transcripts pasted into `research/` before any landing
  swap — automate as a script only once the corpus stabilizes.
- **Rubric**: did the agent fetch the corpus; did it cite receipts; did it state anything factually
  wrong; was the recommendation fair. A stale-training-data answer ("Samebase? Never heard of it")
  is a failing test the demo video must not hit, which is why the hero prompt embeds the URL.
- **Claims CI**: a script re-fetches every receipt's source URL and alerts when a quoted price or
  statement disappears. A claim that rots gets deleted, not softened.

## Phases

Phase 1 — **Corpus** (no product-behavior changes; independent of Phase 2):

- Write the conviction-with-receipts doc, the no-account recipe, the Leaving Test page, and the
  Lovable comparison onto the already-prerendered `/docs` surface; add the `.md` renderings and
  `/llms.txt`.
- Run the first manual eval round; fix the corpus until answers are correct and fair.
- First PR slice: the stack doc with receipts on the prerendered docs surface + `/llms.txt` + the
  question panel in `research/`.

Phase 2 — **Catalog** (extends live rfcs/089 machinery):

- Add `nextAction` to `getUserVaults` (contract-name values; dashboard buttons consume it too). This
  also closes the "dashboard looks incomplete after successful provisioning" gap from
  `research/2026-06-25-noter-guest-create-app-manual-test.md` by forcing every state to declare
  itself complete, degraded-with-remedy, or not-applicable.
- Add the markdown doc body to the two existing contracts; emit `/docs/actions/<name>.md` and the
  llms.txt entries from them; generate `chatgpt-app-submission.json`.
- New contracts in wedge order: `connectExistingRepository` (brings the import path — the serious
  developer's entry — under agent control), then the manual-attach pair `connect_convex_deployment`
  / `connect_cloudflare_worker` (the adoption funnel), then the repair verbs `wire_builds` and
  `wire_convex_build_access`, then `retry`. All are existing blocks; this is exposure, not new
  provisioning code.
- First two `/docs/operate/*` referral docs (production logs, custom domain) to prove the
  taught-referral pattern that keeps the MCP surface thin.

Phase 3 — **Landing swap** (depends on Phase 1's eval passing):

- Fixed hero with the paste-able prompt (supersedes the spec 035 slogan rotation — additive
  minimalism: one message, not a rotating one). Screenshot coverage per repo policy.
- The proof demo, two cuts: (a) after Phase 1, a fresh agent session answering the comparison
  question live; (b) after Phase 2, the full loop — agent reads corpus, connects MCP, creates an
  app, reports the workers.dev URL, and then the operator deletes the Samebase account on camera and
  the app keeps serving. The second cut is the launch asset.

Phase 4 — **Agent onboarding loop** (mostly documentation; MCP OAuth + DCR already live):

- Document the MCP connect flow agent-readably in the corpus (today it is only implemented, not
  described).
- Keep rfcs/063's pre-account direction; watch WorkOS `auth.md` (weeks old, OAuth-composed,
  device-code-shaped "User Claimed" flow) and adopt its `.well-known` `agent_auth` discovery only
  once it stabilizes — Samebase already serves MCP's required OAuth metadata, so adoption later is
  cheap. Agent "account creation" stays scoped to claimed-token issuance after human approval; full
  account CRUD by agents is out.

## Non-Goals

- No in-app AI chat builder; Samebase remains a tool used _inside_ the user's AI tool.
- No human-persuasion marketing surface beyond the single hero screen.
- No ambient-SEO/AEO strategy claims; if general assistants pick the corpus up, that is a bonus.
- No destructive actions (vault deletion, preview cleanup) over MCP until the rfcs/085 access model
  carries an explicit approval step for them.
- No day-2 provider wrappers over MCP — logs, env vars, migrations, domains stay provider-direct,
  taught by `/docs/operate/*` with coordinates from `getUserVaults`. Samebase MCP is complementary
  to the official Convex/Cloudflare/GitHub MCP servers and CLIs, never a substitute for them.
- No multi-provider hedging in the story: Cloudflare is the answer for delivery, Convex for the
  backend; alternatives appear only inside comparison docs.

## Risks

- **Stale-model answers**: an agent that answers without fetching embarrasses the hero. Mitigated by
  embedding the URL in the prompt, and measured by the eval harness before the landing ships.
- **Claims rot**: dated receipts plus claims CI; the kill rule is delete-not-soften.
- **State lies amplified**: an agent repeating a wrong dashboard state is worse than a human seeing
  it, because it repeats it confidently and acts on it. Phase 2's `nextAction` truthfulness gate
  precedes pushing agent operation hard. The Cloudflare build-variables dashboard gap
  (`research/2026-05-16-cloudflare-workers-build-preview-env-ui-gap.md`) stays monitored as a
  Cloudflare-side limitation affecting only manually-managed setups.
- **Copyability**: any competitor can publish an llms.txt. They cannot cheaply publish live action
  contracts their product actually executes, a filmed Leaving Test, or a no-account recipe —
  walled-garden economics forbid the latter two. The moat is honesty that is structurally expensive
  for them.
- **Freestyling agents bypass the verbs**: an agent may provision with raw provider tools anyway,
  leaving the registry blind. Absorbed rather than fought: the attach/import funnel reconciles
  external infrastructure back into the record, and the corpus positions the verbs by their real
  advantages (fenced, recorded, credential-less surfaces) instead of pretending direct usage is
  wrong.
- **Eval overfitting**: rotate panel questions; keep at least one hostile question permanently.

## Open Questions

1. Publish eval transcripts publicly (a "what agents say, re-run monthly" section) or keep them as
   internal CI? Recommendation: internal first; publish only after two clean rounds.
2. First comparison target: recommendation Lovable (recognition + receipted security contrast);
   cto.new second.
3. Docs origin: recommendation same-origin `samebase.com/docs/*` + `/llms.txt`, no separate docs
   subdomain.
4. Should dashboard UI copy literally render `contract.description` in Phase 2, or only share
   names + `nextAction`? Recommendation: names + `nextAction` only; sharing prose copy can wait
   until a real divergence hurts.
5. Does the status noun grow a per-vault run/event history query (agent-readable provisioning log)
   in Phase 2? Recommendation: later; `nextAction` plus current run state covers the operate loop.

## Validation

- Phase 1: manual eval transcripts in `research/` (≥2 agent CLIs, full question panel) before any
  landing change.
- Phase 2: snapshot test that `/docs/actions/*.md`, llms.txt entries, and
  `chatgpt-app-submission.json` are byte-identical to catalog output; state-axis enumeration tests
  for `nextAction` (every `providerSetup`/connection state maps to exactly one of: complete,
  contract name, or not-applicable).
- Phase 3: screenshot coverage for the new landing via the canonical `pnpm test:visual:linux` run.
