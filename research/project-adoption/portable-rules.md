# Portable Project Adoption Rules

## Document Control

- Status: candidate guidance
- Evidence cases: [Bristol TSX](cases/bristol-tsx.md)
- Validation level: not yet tested on a second project

## Use

Give this file and the target repository to the project worker first. Use Samebase only when the
worker asks for missing knowledge or when a safety boundary requires a direct source check.

Record each escalation in the case file. Do not silently add Samebase assumptions to the target
project.

## Start With The Operating Contract

Map these capabilities before a framework or provider change:

- fresh checkout setup
- normal local development
- one-time linked-worktree setup
- anonymous linked-worktree setup
- lint, type checks, tests, and production build
- branch build and version upload
- public preview access and its authentication boundary
- preview resource ownership and cleanup
- production promotion and rollback
- environment and secret ownership
- authentication and private rendering
- logs, safe probes, and release monitoring

The framework runtime, repository workflow, and provider integration are separate layers. A
framework can supply server rendering without supplying preview ownership or cleanup.

## Treat Scripts As An Operator Interface

Name public package scripts by operator intent, not by the current framework implementation.

Before a rename:

1. Find every caller in local docs, CI, provider configuration, and other scripts.
2. State the operation that the script represents.
3. Separate the stable operator action from the framework or provider command behind it.
4. Update all owned callers in the same change.
5. Keep an old alias only when an external caller cannot move in the same release.
6. Prove the new name through the real workflow.

Do not copy script names from Samebase without mapping their meaning.

## Protect Current Behavior

Create framework-neutral characterization tests before a framework migration. Test public and
private route behavior, status and redirects, authentication recovery, server endpoints, assets,
navigation, and service-worker behavior. Do not test framework internals unless they are part of a
real production contract.

Use synthetic local or preview data. Do not put personal data in fixtures, logs, screenshots, or
pull request text.

Route authentication does not replace authorization at the data boundary. Direct backend queries and
mutations must reject an unauthenticated caller even when the normal user interface has a protected
route. Test both anonymous rejection and authenticated behavior for every public data function.

Sign-out must remove private data from browser-owned persistent caches unless the product has an
explicit per-device retention contract. A private cache must start paused after a page load and
clear old persistent data before a valid session can resume reads. A failed clear must not expose
old data to a new session.

## Use A Small Decision Spike

Treat a new framework as a candidate until a small preview spike proves the difficult boundaries.
For a server-rendered Cloudflare application, the spike must prove:

- one public route
- one protected server-rendered route
- one server endpoint
- Convex access in the correct environment
- static assets
- the build and Worker upload path
- no production traffic

Stop and return to the decision record if the spike changes product behavior or requires an unsafe
credential boundary.

## Keep Preview Terms Exact

Use separate names for:

- branch build
- Worker version upload
- public version URL
- application backend preview
- pull request environment

A successful build is not a deployment. A version upload does not imply public traffic. A public
frontend preview is unsafe when its backend has no safe account bootstrap.

## Separate Configuration From Promotion

Provider configuration must not start a production release as a side effect. Validate a branch build
and version before production promotion.

Give a production build only production credentials. Give a preview build only preview credentials.
Do not broaden credential access only to make an inventory status appear complete.

Keep the current production host and rollback target active until the new path passes its explicit
cutover gate.

## Bidirectional Review

For each difference between the target project and Samebase, select one result:

- the project adopts the Samebase practice
- Samebase adopts the project practice
- both adopt a shared asset
- both stay different because their requirements differ
- the decision waits for more evidence

An improvement to Samebase requires a separate branch, full consumer inspection, proportional tests,
and its own pull request.
