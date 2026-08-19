# Public Launch Checklist

Everything gated on making Samebase public, so day-to-day work can keep linking to not-yet-public
repos and pages (operator policy: link now, flip later; this file records the flips). Sources:
`rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md` Phase 3,
`research/2026-07-07-agent-landing-eval-round-1-findings.md`,
`research/2026-07-08-samebase-app-template-maintenance-plan.md`.

## Eval gate (before the landing swap)

- [ ] Merge and deploy the round-1 corpus fixes (PR #1181)
- [x] Public pricing / early-access posture page (also answers the Q7 maturity flag): `/pricing`,
      permanent free tier, "Samebase is early" posture in the metering paragraph
- [ ] Tighten MCP/operate wording: Samebase gives coordinates and repair actions; provider-direct
      tools perform logs and domains
- [ ] Eval round 2 against the deployed corpus
- [ ] Second clean round (RFC 093 bar), then decide whether transcripts go public

## samebase/app is public

- [x] Curated v6 line is `main` (2026-07-08); old Pages-era line kept as `v3-router-pages`
- [x] Repository is public and remains a GitHub template (2026-08-04)
- [x] Public `main` history is append-only; rewrites require a new edition
- [x] Obsolete branches, including `v3-router-pages`, were removed before publication

## samebase.com flips

- [x] `apps/samebase/src/content/docs-do-it-yourself.md`: replace the "private today" sentence with
      the template link and a "Use this template" step
- [x] `apps/samebase/src/content/docs-the-stack.md`: same sentence in the template paragraph
- [ ] Landing swap: pasteable-prompt hero supersedes the spec 035 slogan rotation (amend spec 035,
      screenshot coverage)
- [ ] Revisit spec 088's mirrored media once raw template URLs are public and stable

## Pricing track

- [x] Public `/pricing` route (unauthenticated, prerendered, linked from llms.txt) with Personal
      Free at 12 pooled connections, GitHub organization Free at 6, and Pro at 120 for $4 per month
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

- [x] Monorepo-owned app template: generate the stored seed from `templates/app` and publish the
      accepted tree to `samebase/app` (2026-08-15)
- [ ] README "Do it faster with Samebase" section in samebase/app, mirroring the old notermd §8
      funnel
