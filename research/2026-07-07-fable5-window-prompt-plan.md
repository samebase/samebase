# Fable 5 Window: Recon Audit and Ranked Prompt Plan

Date: 2026-07-07

Status: Research. A prompt plan for the remaining Claude Fable 5 subscription window, produced by a
10-agent recon sweep (five repo readers over direction/threads/quality/organization/action-model,
two web researchers on Fable 5 prompting, three independent prompt drafters). Every file anchor
below was spot-checked against the working tree at v1658 before publishing.

## Why these prompts and not others

Fable 5's verified edge over Opus 4.8 is long-horizon autonomy, first-shot correctness on complex
well-specified systems, hard state-model design, and sustaining parallel subagents — not bounded
everyday coding (converges with Opus at ~2x cost) and not PR review (CodeRabbit measured Opus
_ahead_ on review precision). So the window should buy **decisions, exemplars, and durable assets**
that cheaper models execute against for months — not routine fixes.

Fable-specific mechanics that each prompt below already encodes:

- **Goals, not checklists.** Prescriptive step lists degrade Fable output; state the goal, the
  constraints, and the deliverable shape
  ([Anthropic prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5)).
- **Effort is the main lever.** `high` default; `xhigh` only for the hardest state-model/generics
  sessions (P2, P3); `medium` for bulk work — medium Fable still benchmarks above Opus 4.8 at half
  the cost ([guide digest](https://knightli.com/en/2026/06/10/claude-fable-5-prompting-guide/)).
- **Never ask it to echo its reasoning** — that trips the `reasoning_extraction` classifier and
  silently downgrades the session to Opus 4.8
  ([Anthropic announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5)).
- **Ground every progress claim in a tool result** — Anthropic's own snippet nearly eliminated
  fabricated status reports.
- **The oracle split**: cheap subagents do ALL reading/fetching; Fable's own context is reserved for
  judgment. This is the institutionalized pattern behind Amp's oracle and steipete's `ask oracle`
  workflow ([Amp](https://ampcode.com/news/gpt-5-oracle),
  [oracle](https://github.com/steipete/oracle)).
- **Taste transfer needs exemplars, not adjectives.** Pure style-transfer instructions measurably
  fail; naming the exact refactor type lifts success from ~16% to ~87%
  ([study](https://arxiv.org/pdf/2406.10320)). That is why P5 exists: it manufactures the exemplar.
- **Window mechanics**: Fable 5 leaves subscriptions after 2026-07-07 (usage-credit billing at
  $10/$50 per Mtok after; enable usage credits or access hard-stops), and the current allowance is
  capped at 50% of weekly plan limits
  ([coverage](https://tech.yahoo.com/ai/claude/articles/claude-fable-5-leaving-subscriptions-153244723.html)).

## Session plan for the remaining hours

Run **three Fable sessions in parallel worktrees** with disjoint write scopes, then backfill from
tier 2 as sessions finish:

| Slot | Prompt                              | Write scope                                       | Effort |
| ---- | ----------------------------------- | ------------------------------------------------- | ------ |
| A    | P1 Phase 3 gate flip                | `src/content`, `src/routes`, `research/`          | high   |
| B    | P2 Infrastructure truthfulness      | `research/` only (decision doc)                   | xhigh  |
| C    | P3 Action-catalog derivation        | `convex/toolRuntime`, `convex/mcp`, `scripts/`    | xhigh  |
| next | P4 Lovable doc, P5 exemplar rewrite | `src/content` / `src/components` (after A/C land) | high   |

Everything in the "mechanical queue" at the bottom goes to Codex or a cheaper model — spending
double-rate Fable allowance there is the documented anti-pattern.

---

## Tier 1 — run these first (they gate everything else)

### P1 — Flip the RFC 093 Phase 3 gate: pricing, maturity, boundary wording, round-2 rubric

Why: eval round 1 (PR #1181) returned an explicit NO-GO for the landing swap with four named
blockers; the DIY-guide fix is already on the branch, and the remaining three (public pricing,
maturity posture, MCP-overclaim wording) are pure product judgment no cheap model should make.
Pricing has zero draft anywhere in the repo. One session lands all remaining blockers plus a
mechanical round-2 rubric, making the rerun cheap-model-runnable.

Risk: pricing is ultimately Nicu's call — the prompt demands one model plus its change-triggers, so
overruling is cheap.

```text
You are in the Samebase repo (AGENTS.md rules apply; ship a PR at the end). RFC 093
(rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md) makes the landing page a paste-able prompt that coding
agents answer by reading the public corpus. The Phase 3 landing swap is gated NO-GO by eval round
1 — read the findings with
`git show origin/rfc-093-eval-gate:research/2026-07-07-agent-landing-eval-round-1-findings.md`
(PR #1181). The DIY-guide fix is already on that branch. Your session lands the remaining blockers
and makes round 2 runnable. Use cheap subagents for ALL reading and fetching; spend your own effort
on the decisions and the prose. Ground every claim you write against a fetched source or repo code
before claiming done.

Deliverable 1 — PRICING. /pricing today is an authenticated dashboard page
(apps/samebase/src/routes/pricing.tsx wraps AuthenticatedAppRoutePage). RFC 093 Phase 3 says the
public pricing surface ships "together with the settled Samebase pricing" — but nothing anywhere
records what Samebase costs or should cost, and both eval agents (Q2/Q7) made the absence an
adoption blocker. Decide one exact pricing model with numbers (free-tier boundary, what is paid,
what is metered), coherent with the receipts-grade cost story ($0 idle apps on user-owned
providers) and the philosophy in research/2026-07-06-stack-decision-rationale-interview.md ("stuck
paying $20/month" is the enemy). The model must survive the hostile question "how does this
company make money and will it exist next year" AND the corpus claim that a single app is
basically free to run. Flag at most one number as needing operator confirmation, and state what
would make you change the model. Then WRITE the public pricing page — shipping text, not a plan —
in the corpus voice (study apps/samebase/src/content/docs-receipts.md and docs-the-stack.md as
exemplars: receipts-grade, every claim checkable, no filler). Have a subagent re-verify current
Convex/Cloudflare pricing against live provider pages first; round 1 caught a "$25/dev/month"
factual slip.

Deliverable 2 — MATURITY. Hostile Q7 flags "no maturity signals, no company size, no SLA" and will
keep flagging until the corpus gives a truthful answer. Samebase is a solo-operator early product
whose structural answer to "what if it dies" is the Leaving Test: apps deploy onto the user's own
GitHub+Convex+Cloudflare accounts and keep serving after the Samebase account is deleted. Decide
the disclosure posture and write the exact about/maturity copy block and where it lives.

Deliverable 3 — BOUNDARY WORDING. Both CLIs overclaimed that Samebase's MCP performs logs and
custom domains when the doctrine is taught-referral only ("wrap the join, not the providers").
Decide the one wording rule that stops that inference, and apply the concrete edits to
apps/samebase/src/content/docs-operate-production-logs.md, docs-operate-custom-domain.md, and the
Operate section of apps/samebase/public/llms.txt (note apps/samebase/scripts/generate-action-docs.ts
owns llms.txt generation — edit at the source and regenerate). The structural mechanism (contract
boundary fields, MCP resources) is a separate session; here only the copy rule that unblocks
round 2.

Deliverable 4 — ROUND-2 GATE. Turn the round-1 findings into a mechanical rubric appended to
research/2026-07-06-agent-landing-eval-questions.md: per-question must-pass invariants each citing
the actual round-0/round-1 failure it exists to catch (Q4: zero invented MCP capabilities; Q2/Q7:
pricing no longer a blocker once /pricing ships; Q7: harsh-but-factual passes,
factually-wrong-hostile fails; any invented capability anywhere = automatic no-go), a harness
purity preflight from the recorded contamination modes (a round whose harness fails preflight is
VOID, not failed), the question-rotation rule (Q7 never rotates), and a one-paragraph ruling on
RFC 093 open question 1 (publish eval transcripts publicly?). No hypothetical failure modes, no
rubric bureaucracy an n=2 manual eval cannot support. End with the paste-ready round-2 runbook:
exact per-CLI commands, which edits land on rfc-093-eval-gate vs main, deploy step, then the full
8-question two-CLI rerun.

Constraints: never use Vercel as an example provider (Netlify when a non-Cloudflare example is
needed); additive minimalism — no filler copy. Wire new pages the same way docs-do-it-yourself.md
is wired (src/content markdown, route, raw .md serving, llms.txt presence).

Deliverable: one PR with the pricing page, the maturity block, the wording edits, the rubric, and
a ≤15-line decision note in the PR body stating the chosen pricing model and the single deciding
reason. One recommendation per decision — no option menus, no "it depends".
```

### P2 — Infrastructure truthfulness end-state: verify_infrastructure + one remedy engine

Why: the registry is trust-on-write and provably lies today (a Worker wired before the v1651
deploy-key rename keeps `convexBuildAccess: wired` forever, which hides the repair button AND makes
the repair mutation early-return — stale state is structurally unrepairable). RFC 093 gates pushing
agent operation on exactly this ("state lies amplified"), the dashboard doesn't consume the
`nextAction` field the backend already computes, and PR #1178's RFC has locked decisions but an
unresolved Phase 2 state shape. This is the hardest pure state-model design in the backlog — the
sharpened successor to main_idea.md's first pre-drafted prompt.

Risk: Fable may try to redesign the whole provisioning block graph (settled by RFC 090's shipped
recomposition); the prompt pins the shipped model as fixed input.

```text
I'm deciding the final truthfulness architecture for Samebase's infrastructure registry. Repo:
this checkout. Context budget rule: use cheap subagents for ALL file reading, `gh` fetching, and
code enumeration; spend your own effort only on the state-model decision. Give conclusions with
evidence.

The problem, concretely: registry state is trust-on-write. A Worker wired before the v1651
deploy-key rename (PR #1171) keeps `convexBuildAccess: { state: "wired" }` forever even though the
keys are gone. While that flag lies, the dashboard hides the repair action
(apps/samebase/src/components/vault-dashboard/vaultResourceRailState.ts:415-432, gated on
`canRepairCloudflareWorkers` + raw state checks) and the wiring mutation early-returns
`{ active: false }` (apps/samebase/convex/vault/cloudflareMutations.ts:1153-1161, bails when
state === "wired"). So a stale row is not just undetected — its repair is unreachable.
rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md names this exact failure mode ("State lies amplified",
Risks section) as the gate before pushing agent operation.

What exists:
- Remedy engine: apps/samebase/convex/vault/dashboard.ts:130-192
  (readProviderSetupFailedNextAction), :333 (`wire_builds`), :349 (`wire_convex_build_access`).
  Contract: apps/samebase/convex/vault/contracts/getUserVaults.ts (nextAction literals :56-77; doc
  admits sourceSetup.failed carries NO nextAction, :222-223; stale `rfcs/111` cite at :44 — should
  be 093).
- The dashboard does NOT consume nextAction yet — the rail re-derives repair visibility from raw
  state (vaultResourceRailState.ts). Two remedy engines can disagree; RFC 093's invariant clause 4
  forbids exactly this.
- Open RFC: PR #1178 (branch rfc-094-infrastructure-verification, file
  rfcs/094_INFRASTRUCTURE_VERIFICATION_PLAN.md) proposes a `verify_infrastructure` block. Locked
  decisions: presence-only, names-never-values, fail-closed, on-demand. Open: Phase 2 state shape
  (Worker/deployment existence variants), and trigger-rebind detection — today a conflicting
  existing trigger just throws (apps/samebase/convex/cloudflareResources.ts:1200-1220) instead of
  `wire_builds` learning conflicting-trigger repair. Note: this RFC collides with #1173 over the
  number 094 and one must renumber per rfcs/README.
- The shipped provisioning block model is FIXED input, not up for redesign:
  rfcs/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md,
  specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md,
  specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md.

Subagent tasks (dispatch in parallel, get summaries): (1) fetch PR #1178 full RFC text + review
threads via gh; (2) enumerate every registry field written trust-on-write in
apps/samebase/convex/vault/cloudflareMutations.ts, convexMutations.ts, and records.ts; (3)
enumerate the real sourceSetup failure causes from code + git history + PR #1176 body; (4)
summarize the shipped block model from the three anchors above.

YOUR decision (Fable-only reasoning): the durable end-state. Specifically:
1. Verdict on each of PR #1178's locked decisions: keep or amend, one line each.
2. The state shape per provider resource: does observed/verified state live inside the same record
   as recorded state (a dimension), or replace it on verification (a transition)? Give
   validator-sketch TypeScript (discriminated unions, invariants in the shape per
   docs/code-guardrails.md — no cross-product states the product doesn't need).
3. How verification results feed nextAction so exactly ONE remedy engine exists — and the ordering
   call: does the rail consume nextAction before verification ships, or after?
4. sourceSetup.failed: the verified failure-cause → remedy mapping, or the explicit criterion under
   which it stays remedy-less.
5. Exact failure boundaries: what throws, what becomes a degraded state with a nextAction
   (including the conflicting-trigger case).
6. What to delete: the early-return guard, the rail's own derivation logic, any state variants.
7. First PR slice with acceptance criteria, and merge order relative to #1178 and #1173 (including
   the renumber).
8. The 2-3 concrete edge cases that would invalidate your design.

Write the decision as a markdown doc committed to research/ on a new branch and open a draft PR.
Pick one design and defend it. Give a recommendation, not a survey.
```

### P3 — Action-catalog: collapse the 7-site wiring into catalog-derived plumbing

Why: adding one action today touches ~7 hand-written sites; `runtime.ts` is 494 lines of eleven
clone bridges and `mcp/http.ts` repeats the identical `@ts-expect-error` 8 times — the exact
anti-pattern docs/code-guardrails.md prescribes one wrapper for. Designing an honest generic bridge
under the no-assertions rules and Convex's static-export constraint is hard type-level work squarely
in Fable's lane, deletes ~400-600 lines, and makes the next nine tools one-file additions. It also
closes the usageAttribution drift RFC 093 ordered and #1177 skipped, and rules on PR #1173's
registry so that thread stops idling.

Risk: Convex codegen limits could make the fully generic bridge impossible without laundering; the
prompt pre-authorizes the eleven one-line factory-export landing zone.

```text
You are in a worktree of the Samebase repo (AGENTS.md loaded; `pnpm dev --once` if Convex
complains). Before touching Convex code, read apps/samebase/convex/_generated/ai/guidelines.md
(repo rule). Fresh branch, reviewable commits, PR at the end.

Context: RFC 093 shipped an 11-action catalog — apps/samebase/convex/toolRuntime/actionCatalog.ts
(list at lines 23-35, exported types ActionContractId/ActionContractMcpName at ~38-39, currently
unconsumed) — where each action has one contract module in convex/vault/contracts/. The MCP
plumbing around it is 11-fold copy-paste violating the house wrapper rule (docs/code-guardrails.md:
absorb a recurring TS technicality into ONE tiny wrapper with the @ts-expect-error inside):

- convex/toolRuntime/runtime.ts (494 lines): eleven near-identical internalAction bridges
  (createRepositoryTool:48 ... retryInfrastructureProvisioningTool:462), each repeating
  scope-check + try/catch + text formatting.
- convex/mcp/http.ts (1,115 lines): eleven callXxxMcpTool wrappers plus a hand-built
  mcpToolCatalog; the identical comment "@ts-expect-error Raw MCP arguments intentionally flow to
  Convex action validation." repeats at lines 80, 95, 117, 128, 139, 147, 158, 169.
- convex/usageAttribution.ts (~lines 14-26): a hand-maintained 12-member SamebaseUsageMcpToolName
  union with no derivation from the catalog and no drift guard — RFC 093:106-107 ordered this
  consolidation; #1177 skipped it.
- apps/samebase/scripts/generate-action-docs.ts:51-79: hand-written contractSourceByMcpName path
  map.
- convex/vault/contracts/getUserVaults.ts:56-77: nextAction literals with no type-level tie to
  ActionContractId — a catalog id rename silently orphans the remedy vocabulary. (Also fix the
  stale citation at :44 — it cites nonexistent "rfcs/111"; the invariant is rfcs/093.)

Goal: catalog-derived plumbing so adding an action means one contract file plus one catalog entry.
Hard constraints you must design within (this is the Fable-worthy part, do it yourself): (a) no
`any`, no type assertions, no laundering through type-erasing generics — the type gap at the
raw-MCP-args seam must end up as ONE audited @ts-expect-error inside one shared wrapper with an
honest outer signature; (b) Convex functions must remain statically-named module exports for
codegen — a factory like `export const createRepositoryTool = mcpToolBridge(contract, handler)`
keeps that, a runtime loop over module.exports does not; decide whether eleven one-line factory
exports or one dispatcher internalAction keyed by tool name is the honest shape, and say why in
one paragraph; (c) keep the drift-guard test convex/mcp/http.convex.test.ts:179-186 (MCP tool list
pinned to catalog order) passing, strengthening it if your design makes a stronger guarantee
checkable.

Delegation split: subagents read and summarize — the 11 contract modules' shapes, the full
runtime.ts and http.ts, the generator script, and how usageAttribution consumers use the union.
You design the generic bridge type, the satisfies-checked derivation of SamebaseUsageMcpToolName
from ActionContractMcpName, the nextAction-literal tie to ActionContractId, and the generator map
derivation. If a derivation cannot be expressed honestly, say so and leave the hand-written union
with a drift-guard test instead.

Done-ness: MCP tools/list output unchanged (drift-guard test green); regenerate docs and prove
byte-identical output — run the generator and show `git status` clean for public/docs/actions/*.md,
llms.txt, chatgpt-app-submission.json (verify:action-docs CI guard stays green); exactly one
@ts-expect-error remains at the seam (grep evidence); `pnpm check` and `pnpm test:convex` green;
report net lines deleted with tool-result evidence.

Commit slices: (1) generic bridge + runtime.ts collapse, (2) http.ts call-wrapper collapse, (3)
usageAttribution + nextAction + generator-map derivations.

Two closing rulings in the PR body (≤20 lines each, no extra sessions):
1. PR #1173 (branch codex-agent-docs-registry-rfc, rfcs/094_AGENT_ACTION_DOCS_REGISTRY_PLAN.md —
   the guide-layer registry: packages/action-docs, frontmatter schema, MCP resources, public
   raw-repo export, 6 phases): accept, shrink, or fold into the shipped generator, phase by phase,
   under delete-first doctrine — its MCP-resources phase answers a real eval finding; phases 5-6
   look speculative. Include the numbering call: PR #1178 also claims rfcs/094 and one must
   renumber per rfcs/README (main's RFC 093 already cross-references the registry as 094).
2. Given your bridge, confirm that adding the missing list_repository_owners discovery read
   (create_repository requires an `owner` but the discovery read exists only as the UI-only
   listRepositoryOwners at convex/vault/actions.ts:642 — violating RFC 093:159-161's own rule)
   becomes a one-file follow-on, and write the exact follow-up instructions a cheaper model can
   execute.

Pick one design and execute it — do not present alternative architectures.
```

---

## Tier 2 — durable assets and the style exemplar

### P4 — Write the Lovable comparison doc (the deferred most-sensitive corpus leg)

Why: RFC 093 makes name-naming comparison docs a core corpus leg ("Lovable first... an agent will
check fairness") and it was explicitly deferred from Phase 1 because the most sensitive copy gets
focused review — a review bar only the top model meets. Round 1 showed the cost: Claude answered Q1
from training data, Receipted score 0. Persuasive-but-provably-fair writing graded adversarially by
other agents is the single most Fable-shaped writing task in the repo.

```text
You are in the Samebase repo (AGENTS.md rules apply; ship a PR at the end). RFC 093
(rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md, the "Comparison docs that name names" section) makes
comparison docs a core corpus leg: Lovable first, each with a genuine "when they are better"
section, because "an agent will check fairness". It was deliberately deferred from Phase 1
(PR #1175: the most sensitive copy gets focused review) and still does not exist — only a passing
mention in apps/samebase/src/content/docs-receipts.md. Eval round 1 showed the cost: on Q1
("Should I use samebase.com or lovable.dev for my next app?") Claude compared against Lovable from
training data, Receipted score 0 (findings:
`git show origin/rfc-093-eval-gate:research/2026-07-07-agent-landing-eval-round-1-findings.md`).

Write the actual doc. Not an outline, not a plan — the shipping corpus page.

Division of labor — send cheap subagents to: (a) fetch Lovable's CURRENT public pricing, docs,
hosting, and export/ownership story from primary sources — every claim about Lovable must carry a
URL an evaluating agent can fetch; nothing about Lovable from training data; (b) read
research/2026-07-02-landing-copy-receipts.md — its Config-Database Breach Incidents section holds
the CVE-2025-48757 material AND its caveats; the caveats exist because overclaiming a patched CVE
is exactly the unfairness an evaluating agent will catch; (c) read
research/2026-05-18-convex-native-ai-app-builder-competitors.md and the corpus voice exemplars
(docs-receipts.md, docs-the-stack.md); (d) map how docs-do-it-yourself.md is wired
(apps/samebase/src/content markdown → route → raw .md serving → llms.txt entry, with
apps/samebase/scripts/generate-action-docs.ts owning llms.txt) so the new page ships identically.

You own the judgment and the prose: the honest comparison frame (Samebase = real provider accounts
the user owns, the Leaving Test — delete the Samebase account and the app keeps serving — and an
agent-operable 11-action MCP catalog; Lovable = faster to first pixel, integrated hosting, larger
team and product surface), a "when Lovable is better" section an adversarial agent scores as fair,
and the discipline that the doc must survive eval Q1 and hostile Q7 without a single overclaim.
The reader is a coding agent deciding on behalf of its user — write for that reader.

While you are in there, rule on RFC 093 open question 2 in the PR body only (one paragraph, do not
write a second doc): is cto.new the right second comparison target, or should a stack-level
comparison come next (Convex vs Supabase/Firebase, Workers vs Netlify)?

Constraints: never use Vercel as an example provider (Netlify when a non-Cloudflare example is
needed); audit every factual claim against a fetched source or repo code before claiming done; the
CVE material only with its recorded caveats; additive minimalism — no fear-mongering, no filler.

Deliverable: a PR with the comparison doc, its wiring, and llms.txt presence, plus the ordering
ruling in the PR body. Commit to one comparison frame — a fair, verdict-shaped doc, not a
feature-matrix survey.
```

### P5 — Rewrite EditorChatPanel's effect cascade into modeled state (the exemplar rewrite)

Why: the cleanest "invariants in the state shape" violation on a curated product surface — ~14
effects where two separate effects both funnel into `setSending(false)`, one effect manually zeroes
8 states/refs on vaultId change, and a pair mirrors busy state to a prop callback (anchors
verified). The rewrite needs state-model judgment, and the result becomes the exemplar cheaper
models imitate on ChatInput.tsx (11 effects) and MachinesWorkspacePage.tsx (12) — exemplar-based
taste transfer is the only kind that measurably works.

```text
You are in a worktree of the Samebase repo (AGENTS.md is loaded; run `pnpm dev --once` if Convex
tooling complains about CONVEX_DEPLOYMENT). Work on a fresh branch, commit in slices, open a PR at
the end per repo workflow.

Goal: rewrite apps/samebase/src/components/EditorChatPanel.tsx (~14 useEffects) so state movement
is modeled instead of effect-cascaded, and make the result the repo's exemplar for this violation
class. The guardrail is docs/code-guardrails.md, "Effects and reads": every effect must be
justified; in hand-curated state models, effects need even stronger proof.

Verified symptoms (read the file first, these anchors are current):
- Two separate effects both funnel into setSending(false) from derived message data: lines 449-456
  (last message role === "assistant") and 458-462 (hasStreaming). `sending` is really derived
  state with a tiny lifecycle behind it.
- Lines 396-411: one effect manually zeroes 4 useStates + 5 refs when vaultId changes. A
  key={vaultId} remount or a modeled reset makes this structural instead of manual.
- Lines 438-446: a pair of effects mirrors busy state up through onBusyStateChange, including an
  unmount reset — decide whether the parent should derive this instead of receiving mirrored
  callbacks.
- Lines 464-468: an effect that ensures a thread id on first keystroke — probably an event-handler
  concern.
- Remaining effects: draft hydration/save timers, scroll-into-view (428-430), focus (432-436),
  localStorage thread id (390-394).

Delegation split: use cheap subagents to read and report back — docs/code-guardrails.md in full;
EditorChatPanel.tsx plus its test file; every parent that passes onBusyStateChange/autoFocusInput;
the convex/chat data layer it subscribes to; and the route URL editor VM the guardrails cite as
the house standard for curated state models. You (Fable) do the design: enumerate the state axes
first (thread identity, draft lifecycle, send lifecycle, busy reporting) and the allowed
combinations, as the guardrails require for important state models; then decide per axis what is
derived render state, what is an event-handler transition, what needs a reducer, and what dies
entirely.

Deliverable: (1) the rewritten component, with each surviving effect carrying a one-line comment
naming the constraint that forces it; (2) a short state-axes table in the PR description; (3)
tests pinning the send lifecycle (typing → send → streaming → settled) and the vault-switch reset.

Done-ness / behavior-preservation proof: `pnpm check` green; existing chat tests pass (extend,
never weaken); PR body includes a manual checklist grounded in what you actually verified — draft
persists across vault switch per its current contract, send control disabled while pending, busy
state still reaches the parent, focus/scroll unchanged. Ground every progress claim in a tool
result from this session.

Commit in reviewable slices (e.g. derive `sending` + delete the two funnel effects; structural
vault reset; busy reporting; draft lifecycle). If a slice needs a product-behavior call I haven't
given you (e.g. whether draft-save timing is a contract or an accident), state your single
recommended answer and proceed, flagging it in the PR. Do not survey state-management
alternatives — pick the shape, justify it in one paragraph, ship it.
```

### P6 — Adjudicate and execute the jsonUtils schema-first campaign

Why: 32 convex files hand-walk unknown JSON with `readString`/`readNumber`/`asRecord` instead of one
source-of-truth schema — but the counter-rule says validation glue is a carrying cost, so this is
90% per-boundary judgment, exactly what blind cheap-model conversion gets wrong. Also fixes a real
fail-open bug (`connectedMachineHttp.readJsonBody` returns `{}` on malformed payloads).

```text
You are in a worktree of the Samebase repo (AGENTS.md loaded; `pnpm dev --once` if Convex
complains). Read apps/samebase/convex/_generated/ai/guidelines.md before Convex edits. Fresh
branch, one boundary per commit, PR at the end.

Context: apps/samebase/convex/jsonUtils.ts exports a hand-walking reader vocabulary —
isRecord/asRecord/readString/readStringOrNumber/readBoolean/readNumber — consumed by 32 non-test
convex files. The governing guardrail is docs/code-guardrails.md: one source-of-truth schema per
boundary, derive the type from it, do not walk unknown keys the validator already handles — BUT
the adjacent counter-rule says validation glue is a carrying cost, so this is an adjudication
campaign, not a blind conversion. The repo's schema tool is packages/sure (inference-first
validators; read its tests for the idiom).

Verified hotspots (reader-call grep counts, current): codespaces/executor.ts 37 (around lines
1353-1370 it assembles a whole runtime-status object field-by-field with ?? defaults),
vault/convexSchemaGraph.ts 32, connectedMachineHttp.ts 23 — including readJsonBody (~line 29)
which fail-opens to {} via asRecord on any non-record payload, a direct placeholder-fallback
violation — github.ts 12, billing.ts 12, plus a long tail across ~27 more files.

Your job, in order:
1. (Fable judgment) Write the decision rule FIRST, in ≤10 lines: which boundary classes earn a
   sure schema (candidate rule: payloads whose whole shape drives a write, a state transition, or
   a returned contract) versus which legitimately keep the small audited reader vocabulary
   (candidate: best-effort extraction of a few fields from third-party blobs where partial data is
   the product behavior). Test the rule against all five hotspots before committing to it.
2. (Fable execution) Apply it yourself to the five hotspot files as exemplars. Where you convert,
   delete the reader calls entirely and let the sure validator's inferred type be the only type —
   no parallel hand-written shapes, per the guardrail.
3. (Subagents) Have cheap subagents inventory the remaining ~27 files (boundary, payload origin,
   what the parse feeds, your rule's verdict) and execute only the mechanical tail conversions
   AFTER your exemplars exist. Anything ambiguous comes back to you.

Exactly one intentional behavior change is allowed: connectedMachineHttp.readJsonBody fails closed
on malformed payloads (guardrail: fail closed over placeholder fallbacks). Name it in the PR and
pin it with a test. Everywhere else done means no behavior change: `pnpm check` green,
`pnpm test:convex` green, and each converted boundary gets a test feeding a previously-accepted
payload shape asserting the same parsed result.

Deliverable: the applied rule (added to docs/code-guardrails.md only if it genuinely refines what
is there), the converted hotspots, the tail conversions or a precise follow-up list for the files
your rule says to leave alone (with the verdict recorded per file so the next audit doesn't
rediscover this). If jsonUtils ends up with dead exports, shrink or relocate the module —
delete-first applies to the vocabulary itself.

Give the rule and the converted code, not a survey of validation strategies.
```

---

## Tier 3 — if hours remain (or route to Codex with the Fable-written verdicts)

### P7 — Delete-first sweep: the 5,001-line v3 clone, the Solid prototype, the dialog twins

`apps/samebase/src/components/workspace-layout-v3/` is verified byte-identical to v2 modulo rename
(empty diff), consumed only by its own fixture, and silently diverging from live v2 fixes (#1157,
#1160). `apps/workspace-layout-v2-solid` is superseded by PR #1151's own rationale. The
FileCreationDialog/FolderCreationDialog twins hold literally all six unguarded `as` assertions left
in app code. Recommendation: **delete v3** (the pane-trail experiment lives on PR #1152's branch;
re-copying is one command) — but if you want the pane-trail interaction design settled first, run
the drafted pane-trail decision prompt instead; it is taste-heavy, so expect to overrule details.
The sweep itself is mostly mechanical once the v3 verdict is made — fine for Codex with the verdict
pasted in. Full drafted prompts for both (the sweep and the pane-trail verdict) are preserved in the
workflow output; ask any session to regenerate them from the anchors above if wanted.

### P8 — FileView URL-canonicalization → route layer

Three replace-navigate effects in `FileView.tsx` (~lines 207, 239, 256) are URL canonicalization
that belongs in TanStack route lifecycle per the guardrail. The one genuine judgment: the
branch-not-found rewrite depends on server-resolved Convex data — where does that live pre-render?
Worth Fable only if tier 1-2 are done; otherwise Codex with the guardrail cited.

### P9 — VaultDashboard.tsx split (4,821 lines, ~34 components)

The destination convention already exists (28 extracted siblings). Fable value concentrates in the
data-flow grouping map and the riding-along delete-first calls; execution is mechanical. Cheapest
good shape: ask Fable for only the 10-line boundary map + delete-list (5 minutes of one session),
hand execution to Codex. Hard bar: existing tests pass with import-only edits; visual baselines
unchanged under `pnpm test:visual:linux`.

---

## Do NOT spend Fable on these (mechanical queue — Codex or any model)

- **Unblock PR #1181**: one stale test assertion (`LandingPreviewPage.test.tsx:132` expects the old
  DIY title). One-line fix, rerun CI, squash. This gates eval round 2, so do it first — it just
  doesn't need Fable.
- **Renumber the RFC 094 collision**: PR #1178 renames to 095 per rfcs/README (main's RFC 093
  already cites the registry as 094).
- **Merge the green, waiting PRs**: #1158, #1180, #1179 — all CLEAN/green, disjoint files.
- **Close superseded PRs**: #1116 (slogan superseded by merged #1117), #1041 (rebrand executed);
  batch-triage the ~30 noter-era PRs (protocol-bound: `clean` requires Cloudflare+Convex preview
  cleanup per docs/samebase-pr-preview-cleanup.md).
- **Doc hygiene batch**: root sprawl (CHAT_SPEC.md, TODO.md, VISION.md, Ideas/, notes/ fit no row of
  docs/repo-documentation-standard.md), stale RFC statuses (093 and 090 still say Proposed),
  spec/RFC ID collisions (specs: 005/069/075/090/095/097; rfcs: nine numbers) + a numbering guard
  script alongside check-agents-doc-budget.ts.
- **AGENTS.md budget relief**: 30,313 of 32,768 bytes (92.5%) — compress or execute the first
  agent-context migration slice before the next rule addition truncates the tail.
- **Components hygiene**: 20 `*VisualFixture*` files interleaved in the flat components dir; delete
  the stray `components/Untitled-1.md`.
- **Convex domain migration** (fileStaging/cloudflare/github/appProvisioning/connectedMachine →
  domain dirs per accepted specs/095): careful but mechanical; function paths change, so client
  callsites move in the same change.

## Recon appendix — where the full findings live

The complete structured findings (seven readers' summaries + all 17 drafted prompts including the
pane-trail and delete-first sweep full texts) are in the session workflow output; the highest-value
facts are inlined above. Key state-of-play in one paragraph: RFC 093 phases 1-2b/2c shipped
(#1175/#1176/#1177); Phase 3 landing swap is NO-GO per eval round 1 (PR #1181) on four named
blockers (DIY fix on branch, public pricing, MCP-overclaim wording, maturity note); the 11-action
catalog is genuinely unified across UI/MCP/docs for its 11 actions but seven dashboard operations
remain off-catalog and the dashboard does not consume the `nextAction` field it ships; the registry
is trust-on-write and provably lies after the v1651 deploy-key rename, with PR #1178's
verify_infrastructure RFC as the proposed fix; the biggest delete-first violations are the v3 layout
clone (5,001 lines), the Solid prototype app, and the VaultDashboard/fileStagingActions monoliths;
the "enterprise TypeScript" lexical surface is already policed to nearly zero by the custom lint
plugin — the real debt is structural (effect cascades, hand-walked JSON boundaries, 7-site MCP
wiring), which is exactly what tiers 1-2 target.
