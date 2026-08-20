# Public Launch Checklist

Everything gated on making Samebase public, so day-to-day work can keep linking to not-yet-public
repos and pages (operator policy: link now, flip later; this file records the flips). Sources:
`rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md` Phase 3,
`research/2026-07-07-agent-landing-eval-round-1-findings.md`,
`research/2026-07-08-samebase-app-template-maintenance-plan.md`.

## Eval gate (before the landing swap)

- [ ] Eval round 2 against the deployed corpus
- [ ] Second clean round (RFC 093 bar), then decide whether transcripts go public

## Pricing track

- [ ] Cost-model research: PostHog compute attribution; FileView mirroring/collab cost per vault
- [ ] Infra-cost ledger: one-time archaeology of past payments (personal cards, email receipts),
      then an ongoing recording system; once it exists, publish the real infra bill as a dated
      receipt on `/pricing`
- [ ] Exact-compute billing design (requires metering work; later)

## Launch assets

- [ ] Demo cut (b): agent reads corpus, connects MCP, creates an app, operator deletes the Samebase
      account on camera, app keeps serving
- [ ] Claims CI: re-fetch receipt source URLs on a schedule (automate once the corpus stabilizes)

## Anytime (not launch-gated)

- [ ] README "Do it faster with Samebase" section in samebase/app, mirroring the old notermd §8
      funnel
