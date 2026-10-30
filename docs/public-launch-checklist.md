# Public launch checklist

## Repository publication

Reviewed on 2026-10-30. The owner will change the repository visibility. The
[readiness review](../research/2026-10-30-public-repository-readiness.md) records evidence and
limits.

- [ ] Merge the README, contributor guide, root security policy, and public license-copy updates.
- [ ] Review retained Actions logs and artifacts before changing visibility. Recent-log sampling is
      not a review of all retained output. All 26 retained artifacts passed a text and network scan;
      screenshot pixels and older logs remain unchecked. GitHub makes Actions history and logs
      public.
- [x] Triage secret-scanning alert 1. It was resolved as `used_in_tests` after checking the webhook
      test signer, environment stub, and explicit test value.
- [x] Update the GitHub About description to match the app-management product.
- [ ] After publication, enable and verify private vulnerability reporting. The root security policy
      already supplies an email reporting channel.
- [ ] After publication, verify external-contributor workflow approval and branch protection, then
      run a real fork pull request through CI. Fork code must not receive deployment credentials.
- [ ] Verify the deployed FAQ and agent docs show the app's AGPL license, then check the repository
      and license links without authentication.

The full-service startup still needs maintainer configuration. The contributor guide states that
limit. A supported startup path for an outside contributor is a separate engineering task, not a
prerequisite for publishing the source with that limit disclosed.

## Earlier product-launch work

The items below came from the July landing and pricing work. They are retained for context and are
not gates for repository visibility. Sources: `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md` Phase 3,
`research/2026-07-07-agent-landing-eval-round-1-findings.md`,
`research/2026-07-08-samebase-app-template-maintenance-plan.md`.

### Landing evaluation

- [ ] Eval round 2 against the deployed corpus
- [ ] Second clean round (RFC 093 bar), then decide whether transcripts go public

### Pricing track

- [ ] Cost-model research: PostHog compute attribution; FileView mirroring and collaboration cost
      per repository
- [ ] Infra-cost ledger: one-time archaeology of past payments (personal cards, email receipts),
      then an ongoing recording system; once it exists, publish the real infra bill as a dated
      receipt on `/pricing`
- [ ] Exact-compute billing design (requires metering work; later)

### Launch assets

- [ ] Demo cut (b): agent reads corpus, connects MCP, creates an app, operator deletes the Samebase
      account on camera, app keeps serving
- [ ] Claims CI: re-fetch receipt source URLs on a schedule (automate once the corpus stabilizes)

### Other product work

- [ ] README "Do it faster with Samebase" section in samebase/base, mirroring the old notermd §8
      funnel
