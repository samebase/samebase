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

During a framework spike, add candidate scripts under an explicit scope such as `spike:*`. Keep the
current production and provider scripts unchanged until the decision gate passes. Pin each framework
package to its own tested version. Do not assume packages with the same framework label have the
same release number.

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
- a required client-module boundary and client-output privacy scan
- no production traffic

Stop and return to the decision record if the spike changes product behavior or requires an unsafe
credential boundary.

Return exact redirect and unavailable responses from request middleware when the framework must
preserve an empty HTTP body. A server function can serialize a thrown response through its transport
and change the result. Keep the authorization check in the server function too, even when request
middleware already protects the document.

For private source files, block their directory from the client module graph. Then scan the emitted
client output with transformation-resistant fingerprints as an independent control. Comparing only
the original JSON text and its compact serialization is not sufficient because a bundler can convert
the same records to JavaScript object literals.

## Prove Authenticated Server Rendering With Synthetic State

Use an explicit local-worktree profile as the positive control for synthetic authentication. A
loopback backend URL is an additional check, not the main permission. Limit account creation to one
random identity under `example.invalid`, one exact flow, and one runner-owned backend. Keep the
password, access token, and refresh token in the parent process. Generate signing keys there and
send them to the runner-owned backend through standard input. Do not put raw values in command
arguments, runner-authored environment files, logs, fixtures, or client output.

An authenticated server-rendering proof must cover this complete request path:

1. create a synthetic account in the isolated backend
2. validate the access token at a same-origin server endpoint
3. set an `HttpOnly`, host-only, `SameSite=Lax` session cookie
4. send the cookie to the local Worker runtime
5. recheck the identity in the protected server function
6. render a synthetic private canary only after authentication
7. prove the canary is absent from the client bundle

Return `401` and remove the cookie only for a verified authentication rejection. Return `503` and
keep the cookie when configuration, DNS, the network, or the backend is unavailable. This
distinction prevents a provider outage from becoming a destructive sign-out.

When the Worker runtime cannot fetch a loopback backend, a supervised temporary tunnel can expose
the backend for this proof. Use the tunnel only with synthetic data. The parent process must wait
for backend and tunnel readiness before it starts the Worker. Match the acceptance probe to the real
consumer. In Bristol, the host DNS resolver could not resolve the new quick-tunnel hostname, but
local Workerd could resolve and use it. Tunnel registration plus the authenticated Workerd request
was the correct proof. A host fetch was a false negative.

The parent process must own all created files and process groups. Refuse to replace existing local
configuration. Write an ownership marker before setup. Track short setup and build commands as well
as long-running backend, tunnel, and Worker commands. On normal exit, failure, `SIGINT`, or
`SIGTERM`, stop each process group with a bounded escalation, remove only marker-owned state, and
prove that all selected ports are closed.

Test the interrupt path. A successful normal run does not prove cleanup. An early Bristol runner
stopped the main backend listener but left a site listener and local state after `SIGINT`. Tracking
only the visible long-running services was not sufficient.

## Keep Preview Terms Exact

Use separate names for:

- branch build
- Worker version upload
- public version URL
- application backend preview
- pull request environment

A successful build is not a deployment. A version upload does not imply public traffic. A public
frontend preview is unsafe when its backend has no safe account bootstrap.

Make the version-upload command own the rebuild, privacy scan, Worker name, and configuration path.
If the build tool creates a generated deploy configuration, verify that it points back to the
expected source configuration before upload. Remove deployment-only backend keys from the upload
process environment. Require the application backend URL and prove that the generated server bundle
contains that exact URL before upload. Use a version upload command that does not change traffic.

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
