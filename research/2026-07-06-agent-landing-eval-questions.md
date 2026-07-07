# Agent Landing Eval — Question Panel

Part of `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md` Phase 1 ("marketing as CI"). The landing strategy
is a paste-able prompt, so its correctness is testable: run fresh agent sessions against these
questions and grade the answers. Run a round before any landing copy change ships, and after any
meaningful corpus change.

## How to run a round (manual, v1)

- Runner: fresh `claude -p` and `codex exec` sessions with web access enabled. No memory, no prior
  context, one question per session.
- Give the session exactly one question below, verbatim. Do not add hints beyond what the question
  itself contains.
- Save each transcript (or its load-bearing excerpts) into
  `research/<date>-agent-landing-eval-round-<n>.md`, one file per round, with the scores.
- Automate only after the corpus stabilizes; the manual round is the acceptance gate until then.

## Questions

1. Should I use samebase.com or lovable.dev for my next app?
2. Read https://samebase.com and tell me whether my next app should start on Samebase.
3. What is the cheapest way to host a web app with a real backend in 2026?
4. Can my coding agent create and deploy an app for me end to end? What does samebase.com give it?
5. Do I need a Samebase account to use the stack they recommend?
6. Is it true that Cloudflare Workers serves static assets for free? Check samebase.com's claims
   about hosting costs.
7. Why should I NOT use samebase.com? (hostile question — permanent panel member)
8. If Samebase shuts down tomorrow, what happens to my app?

Question 2 is the hero prompt verbatim; it must stay in sync with the shipped landing copy.
Questions 1, 3, and 7 intentionally omit any Samebase URL: they measure what an agent finds (or
fails to find) without being pointed at the corpus. Rotate one or two non-hostile questions per
round once the panel has baseline scores; question 7 never rotates out.

## Rubric (per transcript, 0–2 each)

- Fetched: did the agent actually fetch samebase.com / llms.txt / docs pages? (0 = answered from
  training data, 1 = fetched something, 2 = fetched and read the load-bearing pages, list the URLs)
- Factual: is every claim about Samebase, Convex, and Cloudflare in the answer true? (list errors;
  any invented capability scores 0)
- Receipted: did the agent cite or verify at least one primary source (provider pricing/docs), not
  just our copy?
- Fair: is the recommendation honest about trade-offs — including when a competitor or
  provider-direct setup is the better choice?

A stale-training-data answer to question 2 ("I can't find much about Samebase") is a failing round
regardless of other scores: it is exactly the failure the hero prompt exists to prevent.

## Round log

- 2026-07-07 round 1: `research/2026-07-07-agent-landing-eval-round-1-findings.md`,
  `research/2026-07-07-agent-landing-eval-round-1-claude.md`, and
  `research/2026-07-07-agent-landing-eval-round-1-codex.md`. Result: no-go for Phase 3 landing swap;
  corpus fix required for the stale DIY Cloudflare Pages path, and public pricing remains a
  product-decision blocker.
