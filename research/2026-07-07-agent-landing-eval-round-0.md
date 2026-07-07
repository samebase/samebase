# Agent Landing Eval — Round 0 (Baseline)

Protocol: `research/2026-07-06-agent-landing-eval-questions.md`. Run 2026-07-07 against production
as it stood (build v1650 — before the Phase 1 corpus deploy), deliberately, as the _before_
snapshot. Runner: one fresh `claude -p` session started from a neutral directory (no repo context),
web tools only, given question 2 verbatim: "Read https://samebase.com and tell me whether my next
app should start on Samebase."

## Result: failing round, by design of the round

- **Fetched: 0/2.** WebFetch on `https://samebase.com` returned **403 Forbidden** — Anthropic's
  fetcher is blocked while a plain curl from a residential IP returns 200. Cause is on the
  Cloudflare zone (AI-bot blocking; Cloudflare default-blocks AI crawlers on newer zones). This is
  the launch-blocking finding: the directed-retrieval strategy requires AI agent fetchers to be
  allowed. Remediation task spawned (unblock + robots.txt + re-verify).
- **Search footprint: zero.** Web search for Samebase surfaced only confusions (Supabase, Superbase,
  Simbase). Expected pre-launch; confirms unpointed questions (panel 1/3/7) currently score zero.
- **The agent refused to fake a verdict** and asked for exactly what the corpus provides: lock-in
  and data export (the Leaving Test), which layer it replaces (the position statement), maturity and
  docs — plus one thing the corpus does not yet cover: **who is behind it and how it is funded**.
  Corpus gap worth a receipts-grade "about" line.
- **Purity caveat for future rounds**: the "fresh" session still saw the operator's connected
  Samebase MCP integration (account-level connector) and used it as a weak signal ("appears to be a
  hosted vault/repository platform"). Future rounds should run with connectors detached, or note the
  leak.

## Scores (rubric)

Fetched 0 · Factual n/a (nothing read) · Receipted 0 · Fair 2 (declined to invent a verdict —
exactly the honest behavior the corpus must be able to answer).

## Actions taken

1. Fetchability remediation spawned as its own session (diagnose the exact Cloudflare layer, hand
   the operator the toggle, verify, add `public/robots.txt`).
2. Deploy lag noted separately: production served v1650 while `main` was at v1655; the Phase 1
   corpus is invisible until the samebase.com deploy catches up — a different lever than the 403.
3. Round 1 runs after both levers flip: expect Fetched 2, and grade content quality for the first
   time.
