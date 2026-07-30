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

- synchronized source commit, application root, and package manager from its committed lock file
- runtime version and pin, package module model, handwritten source language, configuration file
  extensions, import style, and type-check coverage
- fresh checkout setup
- normal local development
- repeatable linked-worktree preparation
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

Complete the source-model comparison before the first test, spike, or implementation commit.
Existing file extensions in the target repository are evidence of its baseline. They are not a
policy decision. When the work adopts a Samebase capability, compare the target with the current
generated-app contract instead of copying only the nearest target pattern.

Keep these development capabilities separate:

- an isolated one-run acceptance test
- repeatable linked-worktree preparation
- long-running linked-worktree development
- anonymous worktree ownership and cleanup
- pull request preview cleanup

Passing one capability does not prove the others.

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

After the gate passes, remove the spike scripts and copied aliases that have no final caller. Shared
script names are useful only when shared tooling or shared behavior consumes them.

## Keep The Authored Source Model Explicit

For a Samebase-aligned Node project, use Node 24, ESM package semantics through `"type": "module"`,
and normal `.ts` files for handwritten scripts, tests, and supported configuration. Run those files
directly with Node. Use explicit `.ts` extensions for relative imports and keep syntax compatible
with Node type stripping.

Type-check the Node automation, tests, and configuration. An application TypeScript configuration
that includes only `src` does not prove those files. Use a separate strict Node configuration when
the browser and Node module-resolution rules differ.

The real provider build must run both the source-model guard and the Node type check. A test that
executes a TypeScript file does not replace static checking.

Add a tracked-source guard that rejects handwritten `.js`, `.mjs`, `.cjs`, `.mts`, and `.cts` files.
Keep exceptions narrow and named. Generated JavaScript and a browser-delivered JavaScript asset can
be valid output exceptions. They are not a reason to write Node automation in JavaScript.

If a tool cannot load its TypeScript configuration under the selected runtime, record the exact tool
boundary before adding a loader or an exception. Do not copy a legacy extension only because the
target already uses it.

## Own Linked-Worktree Preparation

Treat `dev`, `setup:worktree`, and `test:worktree` as useful intent names when their behavior
matches the project. Do not force those exact names onto a project with a different operator
interface.

For a linked-worktree flow:

1. Remove every inherited `GIT_*` value before Git identity discovery.
2. Read the canonical process directory, worktree root, Git directory, and common Git directory.
3. Prove that the process directory belongs to the returned worktree root.
4. Accept linked-worktree identity only when its Git directory is below the common Git `worktrees`
   directory. Use Git directory identity for concurrency and include the root in application-state
   ownership.
5. Remove production, preview, provider, and authentication values before dependency installation,
   Git checkout hooks, setup commands, and development services.
6. Use one atomic per-worktree setup lease. The lease must cover dependency installation, local
   state preparation, account verification, and child cleanup.
7. Bind local state to the exact owner and to hashes of the generated environment and backend
   configuration.
8. Create only the minimum explicit synthetic identities that the project contract needs. Use random
   identities under `example.invalid` when email is the identity. Keep each credential in an
   explicit state. Send signing keys through standard input.
9. Set credential mode `0600` explicitly on supported platforms, then read the final mode back.
10. Track short setup commands and their descendants as well as long-running service groups.
11. Define valid, recoverable, and unsafe lease states. Recover only when the workflow proves that
    the former owner cannot still write. Fail closed when ownership changed or recovery is not
    proven safe.

Bristol uses a Git reference with compare-and-swap updates for its setup lease. Another project can
use a different atomic primitive only when it proves the same ownership, transition, and recovery
facts. For a Git-reference process lease, each update and delete must compare the exact observed
object ID. Recover only a valid quiescent same-host lease after its owner process is gone. Never
recover an active, changed, invalid, or foreign-host lease by age. A database or fenced lease can
use its own equivalent ownership proof.

State the supported process-cleanup and file-permission platforms. A skipped platform test does not
prove the guarantee. Fail closed for a linked-worktree flow when the project cannot prove safe
cleanup or credential ownership on that platform.

Server-rendered controls can be visible before client event handlers are ready. A browser acceptance
test must wait for an application-owned hydration signal or another real interaction-readiness
signal before it clicks. Network idle is not sufficient.

Register each synthetic credential with the redactor before a command or browser action can report
it. Redact raw and URL-encoded forms from output, errors, and stacks. Add a deliberate failing test
for both forms. Do not put a secret value in a command argument.

Run linked-worktree acceptance from committed `HEAD`. Run two full setup, browser, shutdown, and
restart cycles. Check exact account and application-data counts after each cycle. Use the canonical
temporary path when cleanup compares ownership. Read `git worktree list --porcelain -z` after each
add attempt, including a failed add. Refuse removal while an unresolved setup lease exists. Remove
only the exact registered worktree, then read the list again and prove that the registration is
gone. A broad prune is not an absence proof. Preserve the temporary worktree when a failed proof
needs operator inspection.

Keep provider-specific recovery results, application table names, port ranges, and exact credential
file names in the project. For example, Bristol accepts the exact Convex `InvalidAccountId` result
only while its credential is pending. That result is not a portable missing-account rule.

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
loopback backend URL is an additional check, not the main permission. Limit local account creation
to one random identity under `example.invalid`, one exact sign-up flow, and one runner-owned
backend. A deployed preview must use sign-in only against one seeded synthetic account.

Keep every credential in the process that owns the test. This includes the password, access token,
refresh token, and signing keys that the project uses. Send signing keys to the runner-owned backend
through standard input. Do not put raw values in command arguments, runner-authored environment
files, logs, fixtures, or client output.

An authenticated server-rendering proof must cover the project's final request path:

1. create a synthetic account in the isolated backend
2. submit credentials or tokens through the final browser-session owner
3. set the complete final cookie set with its real security attributes
4. send those cookies to the local Worker runtime
5. recheck the identity in the protected server function
6. refresh and revoke the final credential set
7. render a synthetic private canary only after authentication
8. prove the canary is absent from the client bundle

Bristol uses one host-only `HttpOnly` access cookie and one host-only `HttpOnly` refresh cookie.
Another project can use a different set, but its proof must use the final set. A one-cookie spike
does not prove a two-cookie browser session.

Return `401` and remove the cookie only for a verified authentication rejection. Return `503` and
keep the cookie when configuration, DNS, the network, or the backend is unavailable. This
distinction prevents a provider outage from becoming a destructive sign-out.

Try direct isolated Workerd-to-loopback access first. When the Worker runtime cannot fetch a
loopback backend, a supervised temporary tunnel can expose the backend for this proof. Use the
tunnel only with synthetic data. The parent process must wait for backend and tunnel readiness
before it starts the Worker. Match the acceptance probe to the real consumer. In the Bristol spike,
the host DNS resolver could not resolve the new quick-tunnel hostname, but local Workerd could
resolve and use it. Tunnel registration plus the authenticated Workerd request was the correct
proof. A host fetch was a false negative. The final Bristol runner uses direct loopback access.

The parent process must own all created files and process groups. Refuse to replace existing local
configuration. Write an ownership marker before setup. Treat dependency installation and Git
checkout hooks as part of the same isolated trust boundary. Track short setup and build commands as
well as long-running backend, tunnel, and Worker commands. On normal exit, failure, `SIGINT`, or
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

A successful build is not a deployment. A version upload does not imply production traffic, but it
can create a public preview URL. A public frontend preview is unsafe when its backend has no safe
account bootstrap.

Require the branch name and full source commit in provider build metadata. Check that commit against
the remote branch head before the backend build and again immediately before the Worker upload. Bind
each built artifact to its source commit, backend URL, and deployment profile. Reject a missing,
mismatched, or stale value.

For a local upload, make the upload command own the rebuild and privacy scan. In provider CI, it can
reuse the provider-built artifact only after it verifies the artifact metadata. In both paths, own
the Worker name and configuration path. If the build tool creates a generated deploy configuration,
verify that it points back to the expected source configuration before upload. Remove
deployment-only backend keys from the upload process environment. Require the application backend
URL and prove that the generated server bundle contains that exact URL before upload. Use a version
upload command that does not change production traffic. For Wrangler, use `--keep-vars` so an upload
does not remove provider-owned variables, and use `--strict` so warnings can stop an unsafe upload.

For an existing Cloudflare Worker, check these states separately:

- repository `preview_urls`
- repository `workers_dev`
- provider `previews_enabled`

A version upload does not reconcile all three states. Wait for public preview propagation and retry
the safe route check after a short initial `404`.

A safe deployed preview needs a fresh backend, preview-only signing keys, an explicit preview
profile, one seeded `example.invalid` account, sign-in only, and non-debug authentication logs. Keep
the credential outside the repository. Select and show the browser profile before a check. Never
capture DOM state while a credential field contains a value.

Use a real replace operation when a browser tool enters a credential. Do not assume that a platform
modifier shortcut selected the prior text. Verify only that the field lengths match the expected
lengths before submission. Never return the values.

If a browser capture exposes a credential, disable public access, rotate the account and signing
keys, rebuild the backend and Worker, and restore access only after the new preview passes. Clear
temporary browser, process, pipe, and clipboard state.

Cloudflare preview URLs do not provide Workers Logs. Telemetry can also arrive late. An empty
observation query is not proof that no requests or errors occurred. Keep build outcome, Worker
version, public route checks, and named-browser acceptance as separate evidence.

Add a read-only observer before cleanup automation. Give it three explicit results:

- complete when every required fact has direct evidence
- partial when the reads are valid but one or more facts are unproved
- invalid when a read fails or evidence is malformed or contradictory

A partial result is useful evidence. It is not a release or cleanup gate.

Bind source evidence before provider evidence. Compare the local commit, canonical repository branch
head, and pull request head. Bind provider reads to the expected user or service identity, account,
Worker, and provider-owned build URL. Validate identity before state reads begin. Reject a branch
version that receives production traffic.

Treat each observer child as a separate trust boundary. Start from a small OS environment allowlist,
then add only the authentication source that the command needs. Do not inherit project environment
files, endpoint overrides, output-file controls, runtime injection, unrelated provider credentials,
or Git repository overrides. Use fixed executable and argument shapes that work on every supported
platform. Bound stdout and stderr, do not print raw provider responses, and return only selected
identifiers, states, and URLs.

Provider list limits are part of the evidence. A missing item in a bounded response is unknown, not
absent. Require complete evidence for each resource type that the project owns before cleanup. Read
all pages when the provider API is paginated. A complete direct lookup can supply the same proof,
and a project does not need inventory for a resource type that it does not create. A branch alias or
timestamp identifies a candidate, not an exact source binding. Require structured provider metadata
that joins the full source commit, Worker version, and backend identity before cleanup trusts that
relationship.

For each new preview Worker version, store one small versioned annotation when the provider supports
it. Use an exact key set. Include only the full source commit and public backend deployment URL. Do
not include branch copy, account data, credentials, tokens, test-account values, or private
application data. Build the annotation only from metadata that already passed the source, profile,
bundle, and backend checks. Do not let a caller replace the annotation or preview alias.

Treat the annotation as evidence, not authority. Join it to the trusted source head, build, exact
Worker version, active traffic, and live backend inventory. Trust the newest exact branch alias
only. Do not fall back to older metadata that happens to match.

Validate the complete backend hostname before deriving a deployment name. Convex currently documents
`deployment-name.convex.cloud` and `deployment-name.eu-west-1.convex.cloud`. Reject extra labels,
unsupported region labels, paths, queries, fragments, credentials, ports, and a region without a
deployment name.

Do not reuse a deploy key as an inventory key when the provider has a separate management
credential. Keep the inventory unavailable until a safe read source exists.

Keep broad provider management credentials in the system that already owns the provider connections.
Do not copy Cloudflare and Convex management credentials into each adopted repository. Expose a
read-only inventory action first. Add deletion only as a separate retained plan with an expiry and
explicit approval. Re-read every provider fact immediately before deletion and prove absence after
deletion.

Require a closed or merged pull request before cleanup. Store the exact source head and planned
resource IDs. Require set equality between the approved plan and the second live read. Reject
duplicate IDs, changed pagination totals, incomplete pages, matching aliases with unowned metadata,
and any selected Worker version that receives production traffic. If a delete response is lost or
times out, read inventory before any retry.

Make the agent API and UI expose the same evidence. A UI warning can be honest and still be
insufficient for an automated cleanup gate. If the UI can show the pull request Worker and Convex
preview but the agent API cannot read them, report the inventory as unavailable.

Discover branch builds, Worker versions, and backend previews independently during cleanup. Do not
assume that a pull request created all of them or none of them.

When a shared preview runner uses a same-origin backend proxy, set or clear its proxy target for
every run. An inherited target must not change the backend that a clean acceptance run uses. A
non-loopback browser origin must prove that browser backend requests use the intended same-origin
proxy for HTTP and WebSocket traffic. The browser must not receive a loopback backend URL.

## Separate Configuration From Promotion

Provider configuration must not start a production release as a side effect. Validate a branch build
and version before production promotion.

Give a production build only production credentials. Give a preview build only preview credentials.
Do not broaden credential access only to make an inventory status appear complete.

Keep the current production host and rollback target active until the new path passes its explicit
cutover gate.

When the target reuses the production Worker, a default-branch merge is a production cutover even
when the Worker name, DNS, and custom domain do not change.

When a reviewed migration uses stacked pull requests, keep the stack as bounded review evidence.
Create one promotion pull request from the final reviewed head to the production default branch. Do
not merge every slice through the default branch when each merge starts a production build. Record
the current source, backend, Worker deployment, Worker version, custom domain, and rollback target
immediately before the one promotion merge.

Read every non-secret production environment value that a new authentication gate uses. Require the
exact accepted values before merge. A missing value fails the gate. Read the named values one at a
time. Do not list the full provider environment because that output can contain signing keys and
other secrets.

Model backend and Worker promotion as separate steps. If the backend deploy succeeds and the Worker
upload fails, the old Worker runs against new backend functions. Test that state and keep separate
rollback procedures for backend functions and Worker versions.

## Bidirectional Review

For each difference between the target project and Samebase, select one result:

- the project adopts the Samebase practice
- Samebase adopts the project practice
- both adopt a shared asset
- both stay different because their requirements differ
- the decision waits for more evidence

An improvement to Samebase requires a separate branch, full consumer inspection, proportional tests,
and its own pull request.
