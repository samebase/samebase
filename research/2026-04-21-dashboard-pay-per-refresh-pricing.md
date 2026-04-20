# Dashboard Pay-Per-Refresh Pricing Research

## Status

- Date: April 21, 2026
- Scope: dashboard-only branch and pull request visibility
- Purpose: capture a pricing direction for a lighter-weight Noter offer where
  the user can open the dashboard to see repositories, branches, pull requests,
  and preview links without paying for file editing or agent execution.

## Why This Note Exists

Noter already has a useful dashboard-only value proposition:

- see your repositories
- see active branches and pull requests
- open PR links and branch preview links
- triage what needs attention

That value exists even when the user does not need file editing, commit flows,
or a full Codex-style workspace.

The pricing question is therefore not "how much should editing cost?" It is
"what is the right way to charge, if at all, for the refresh work required to
keep that dashboard current?"

## Working Hypothesis

The cleanest pricing model for this surface is "pay per refresh" rather than
"pay per project" or "pay for editing."

In practice, the internal meter should likely be a refresh work unit, but the
user-facing language can stay as simple as "refreshes."

## Product Assumptions

This pricing direction assumes a narrower product surface:

- dashboard access is included
- branch and PR visibility is included
- file editing is not included in this offer
- agent runtime or write actions are not the thing being monetized here

This is intentionally a read-mostly product slice: "show me my PRs and branch
state" rather than "let me open the full workspace and edit files."

## Why Project Count Is The Wrong Primary Meter

Raw repository count is only a weak proxy for cost.

Examples:

- A user with 6 to 50 projects may still be cheap to serve if most projects are
  quiet and only a small number of branches or pull requests are active.
- A user with far fewer repositories may still be expensive if those
  repositories each carry many active branches, PRs, or preview lookups.

The real cost driver is refresh fan-out:

- how many vaults a dashboard refresh touches
- how many active remote branches are considered
- how many current PRs need hydration or cache validation
- how many preview-link or comment scans are needed on cache misses

That makes branch and PR inventory a better pricing signal than raw project
count.

## Why Refresh-Based Pricing Fits The Actual System

Existing dashboard research already shows that freshness and reliability are
driven by repo-metadata refresh behavior, not by the editing surface itself.

Relevant repo context:

- `research/2026-04-08-dashboard-vault-pr-refresh.md`
- `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
- `specs/034_POLAR_BILLING_PHASED_ROLLOUT_SPEC.md`

The cost-bearing work is:

- refreshing repository metadata
- reconciling branch and PR state
- hydrating branch preview metadata when needed
- repeating those reads across many active items

So the product should monetize the refresh load if it needs to monetize anything
at all on this surface.

## Recommended Pricing Shape

### 1. Keep the common case free

The default dashboard-only experience should stay free for the vast majority of
users.

Rationale:

- most users will never accumulate enough active branches or PRs to create
  meaningful refresh cost
- a generous free tier makes the product easier to try and easier to keep using
- the operator expectation is that roughly 95% of users should not hit paid
  usage here

### 2. Do not charge just because someone has many projects

Having 6 to 50 projects should not automatically imply paid usage.

That is still consistent with a free tier if:

- the active branch/PR set is modest
- refreshes stay within a generous included budget
- caching avoids repeated unnecessary fan-out

### 3. Start charging only when branch/PR scale becomes abnormal

The pricing pressure appears when the user has a very large active inventory,
for example on the order of 100 active branches or PRs, or an equivalent amount
of refresh work.

That threshold should be validated with real telemetry, but the key product
principle is clear:

- charge for unusually heavy monitoring use
- do not charge normal users for basic dashboard awareness

### 4. Package dashboard visibility separately from editing

This note supports a packaging split where:

- dashboard-only PR and branch visibility can be free or usage-metered
- editing, agent execution, or managed write workflows can remain separate paid
  entitlements

That avoids forcing a user who only wants PR awareness into a full editing plan.

## Candidate Metering Model

Internally, the meter should be more precise than "one page load equals one
unit."

Recommended internal shape:

- record refresh work units
- derive those units from actual backend fan-out
- translate the result into simple user-facing "refresh usage" language

Possible contributors to a refresh work unit:

- one repository metadata sync
- one branch/PR hydration pass
- one preview-comment lookup when cache is cold
- one manual "refresh now" action

Important rule:

- do not bill users for redundant refreshes caused by product design mistakes or
  overly aggressive background refresh policies

## UX Principles For This Pricing

- Show usage transparently before enforcing limits.
- Prefer a generous included allowance with soft warnings before hard stops.
- Explain that cost comes from refresh scale, not from simply owning many repos.
- Keep the language simple even if the backend meter is more detailed.

## Open Questions

1. What exact backend event should count as a billable refresh work unit?
2. Should automatic page-load refreshes and explicit manual refreshes count the
   same way?
3. Should only cache misses count, or should all refresh fan-out count?
4. What active branch/PR threshold corresponds to real operator cost?
5. How should usage appear on the future usage page so the bill feels
   predictable?

## Recommendation

If Noter wants a lighter-weight monetization path before charging for editing,
the best next step is:

1. treat dashboard-only PR visibility as a valid product tier
2. meter refresh work, not raw project count
3. keep the free tier generous enough that almost all normal users remain free
4. only introduce paid usage when branch/PR fan-out becomes materially costly

If the team decides this direction is real product policy rather than research,
promote it into the future metering phase of
`specs/034_POLAR_BILLING_PHASED_ROLLOUT_SPEC.md`.
