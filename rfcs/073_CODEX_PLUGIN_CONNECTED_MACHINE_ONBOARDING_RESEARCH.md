# 073 Codex Plugin Connected Machine Onboarding Research

## Document Control

- Status: Proposed implementation
- Owner: connected machine onboarding UX
- Last updated: 2026-03-30
- Related docs:
  - `specs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `specs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md`
  - `specs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `specs/072_CONNECTED_MACHINE_PHONE_MVP_SPEC.md`
  - `rfcs/070_NOTER_UI_PR_TRIGGERED_CODEX_LOCAL_AUTOMATION_RESEARCH.md`
  - `rfcs/074_EXTERNAL_CODEX_REMOTE_CONTROL_RESEARCH.md`

## Summary

Noter now has three adjacent but different pieces:

1. hosted MCP auth and consent for the Noter plugin/server
2. a local-only Codex app-server browser research surface
3. a connected-machine foundation that syncs machine presence and thread
   summaries into Convex

What is still missing is the user-facing bridge between them:

1. a Codex user can authenticate Noter today
2. that does not automatically connect the local machine runtime to Noter
3. there is no repo-owned onboarding step yet that says what the user must
   install or run next

This RFC answers that gap.

Recommendation:

1. Do not ask the user to edit a repo `package.json`.
2. Do not make Homebrew the default onboarding path.
3. Short term, make the installer origin URL-scoped so every production deploy
   and every preview deploy can serve its own install entrypoint.
4. Use a thin machine-scoped Node executor, but let the current page URL choose
   which environment or worktree the installer targets.
5. Because stock Node does not execute `https:` entrypoints directly today, the
   first runnable command should be a thin wrapper such as
   `npx @noter-md/sync connect --from <url>` rather than bare
   `node https://...`.
6. A direct `curl -fsSL <url> | node --input-type=module -` form is acceptable
   for internal or preview workflows, as long as the bootstrap stays a
   single-file script.
7. Long term, replace the wrapper with a native desktop companion/daemon while
   preserving URL-scoped environment selection.

The key product truth is:

1. MCP authentication grants access to Noter's hosted tools
2. connected-machine control requires a second, explicit machine registration
3. that registration should feel machine-centric, not repo-centric

## User Question This RFC Answers

If a user:

1. uses the Codex app
2. adds the `noter.md` plugin / MCP server
3. clicks `Authenticate`
4. logs into Noter successfully

What should happen next so they can actually see and control local Codex
threads?

Specifically:

1. do we ask them to install something?
2. if yes, is it a repo dependency, a package manager install, or something
   else?
3. where should that onboarding live?

## Current State

### What authentication already solves

The MCP/OAuth specs already define the hosted auth flow:

1. the MCP client starts OAuth against Noter
2. the browser lands on `https://noter.md/oauth/mcp/consent?...`
3. the user signs in and approves the MCP client
4. the MCP client receives OAuth credentials for the hosted Noter MCP surface

That is real and useful.

It means the user can access hosted Noter capabilities through the plugin.

### What authentication does not solve

It does not yet prove or create any of the following:

1. that this laptop is a registered Noter execution target
2. that Noter may read local Codex thread inventory from this machine
3. that Noter may send turns or commands to this machine
4. that a connector/daemon is installed and running locally

The authenticated MCP session and the connected-machine session are separate
things.

### What local thread control already exists

`specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md` and merged
PR `#358` provide a local dev-only browser route that can:

1. list local Codex threads
2. read thread detail
3. resume/archive/unarchive threads
4. send a prompt to a selected thread

But that surface talks directly to a local dev bridge. It is not a production
user onboarding flow.

### What connected-machine work already exists

PR `#359` adds the initial cloud-side connected-machine foundation:

1. `connectedMachines`
2. `machineThreads`
3. machine heartbeat sync
4. machine thread-summary sync

It still does not provide the user install story or the machine registration
story.

## Product Boundary

The correct mental model is:

1. MCP plugin connection is account-level and hosted
2. connected-machine connection is machine-level and local

Those should compose, but they should not be confused.

The user should not be expected to infer:

1. that successful MCP auth means their local machine is now connected
2. that they need to edit a project repo to make machine sync work
3. which package manager they should use

Noter must tell them explicitly what the next step is.

## Why `package.json` Is The Wrong Install Surface

Do not ask the user to add the connector to a repo `package.json`.

Reasons:

1. The connector is machine-scoped, not repo-scoped.
2. A single machine may serve many repos and many Codex threads.
3. Asking the user to install into every repo creates duplication and drift.
4. A repo dependency implies the connector belongs to application runtime or
   project dev tooling, which is false.
5. Connected-machine state belongs under user or machine storage, not inside an
   arbitrary project checkout.

Conclusion:

1. `package.json` is the wrong abstraction for this feature.

## Homebrew As Default

Homebrew could be a distribution option, but it should not be the default
onboarding path.

Pros:

1. familiar for many macOS developers
2. good for a long-running background daemon tool
3. easy to update on macOS

Cons:

1. macOS-only by default
2. not every Codex desktop user has Homebrew installed
3. it makes the first-run flow feel more operator-heavy than product-grade
4. it does not help Windows or Linux

Conclusion:

1. Homebrew is acceptable as an optional install channel
2. it is not the best default instruction

## Candidate Install Surfaces

### Option A: Repo dependency

Example shape:

1. `pnpm add -D @noter-md/sync`
2. add a repo script
3. run from inside one checkout

Verdict:

1. reject

### Option B: Homebrew formula

Example shape:

1. `brew install noter/tap/noter-machine`
2. `noter-machine connect`

Verdict:

1. fine as one channel
2. not default

### Option C: Hosted ESM bootstrap script

Example shape:

1. `node https://<current-deploy>/noter.js`
2. the hosted script performs machine registration and connector setup

Pros:

1. memorable and presentable
2. makes the install surface feel product-owned instead of package-manager-owned
3. keeps the bootstrap logic machine-scoped and repo-independent
4. gives Noter one canonical public entry script to document and improve

Cons:

1. stock Node does not support `https:` URLs as a normal positional entrypoint
2. Node's `--entry-url` flag is experimental and still does not make `https:`
   entrypoints work with the default loader
3. the first shipped experience still needs a wrapper or launcher

Verdict:

1. strong canonical artifact
2. not yet the first runnable command in stock Node

### Option D: Standalone npm package / Node wrapper CLI

Example shape:

1. `npx @noter-md/sync connect --from https://<current-deploy>/noter.js`
2. or `npm install -g @noter-md/sync`
3. wrapper internally downloads or delegates to the provided URL

Pros:

1. machine-scoped
2. cross-platform where Node is available
3. no repo modification
4. actually runnable with current Node
5. allows every preview deploy to provide its own install source
6. easiest way to ship quickly from the current Node-based connector code
7. can later install a background service / launch agent

Cons:

1. still assumes Node is available
2. first-run command-line UX is not as polished as a native companion app
3. the CLI contract must stay explicit about which URL it trusts and executes

Verdict:

1. best short-term default

### Option D1: Hosted pipe-to-Node bootstrap

Example shape:

1. `curl -fsSL https://<current-deploy>/noter.js | node --input-type=module -`

Pros:

1. works with current Node
2. keeps the visible public artifact at `https://<current-deploy>/noter.js`
3. avoids introducing npm package branding into the main install instruction

Cons:

1. pipe-from-network commands have worse trust optics than a local file or
   package install
2. the script should be bundled into one file because relative imports will
   resolve against the current working directory, not the remote deploy origin
3. depends on `curl` being present

Verdict:

1. acceptable for internal or early adopter flow
2. likely too rough as the long-term primary install instruction

### Option E: Native desktop companion

Example shape:

1. user clicks `Connect this machine`
2. Noter downloads or launches a signed desktop helper
3. helper installs a background service and registers the machine

Pros:

1. best product UX
2. least CLI friction
3. best fit for trusted reconnect and background presence

Cons:

1. most implementation work
2. distribution/signing/update story required

Verdict:

1. best long-term path
2. not the fastest path to MVP

## Recommended User Flow

### Phase 1: Short-term shipped flow

After successful MCP auth from Codex:

1. Noter should not pretend the machine is connected.
2. The browser should land on a Noter page that checks whether the account has
   any connected machines.
3. If none exist, the page should say:
   - you authenticated Noter successfully
   - your local machine is not connected yet
   - to browse or continue local Codex threads, connect this machine now
4. The page should provide one primary CTA:
   - `Connect this machine`
5. Clicking that CTA should reveal a single copy-paste command, not a menu of
   package-manager choices.

Recommended command shape:

```bash
npx @noter-md/sync connect --from https://<current-deploy>/noter.js
```

Canonical hosted installer artifact:

```text
https://<current-deploy>/noter.js
```

The installer should then:

1. verify Codex is installed locally
2. verify the user can run the local connector
3. open a browser handoff or consume a short-lived registration token from the
   current signed-in Noter page
4. create a machine identity
5. store machine-local state outside repos
6. start heartbeats and thread-summary sync in the current setup flow
7. defer OS-native background startup to a follow-up phase

After that:

1. Noter redirects to the connected-machine browser route
2. the machine appears online
3. the user can browse local threads

### Phase 2: Better trusted reconnect

After first install:

1. the connector should auto-start on login
2. the machine should reconnect without repeating browser auth
3. Noter should remember this device as a connected machine

This aligns with the useful parts of Remodex's trusted reconnect model without
requiring a custom relay stack in MVP.

### Phase 3: Native companion

Replace the `npx` onboarding with a proper desktop helper while preserving the
same product model:

1. account auth in browser
2. machine registration on device
3. trusted reconnect afterward

## Where The Flow Should Live

The onboarding must live in product UI, not only in docs.

Required surfaces:

1. MCP post-auth success page
2. connected-machines empty state in the web app
3. a short docs page linked from both

### Post-auth success page

After MCP consent succeeds, the browser should not just say "connected".

It should branch:

1. If the account already has a connected machine:
   - offer `Open connected machines`
2. If the account has no connected machines:
   - explain that hosted MCP auth succeeded
   - explain that local machine control needs one more install step
   - present the install CTA

### Connected-machines empty state

If the user later visits the machine surface with no machines:

1. repeat the same guidance
2. use the same primary install command
3. avoid diverging instructions

### Docs page

Docs should exist, but as reinforcement:

1. `How to connect your Codex machine to Noter`
2. explain what this install does
3. show troubleshooting
4. explain that this is machine-scoped, not repo-scoped

## Recommended Copy Direction

The core message should be:

1. "Noter is authenticated."
2. "To browse and continue local Codex threads, connect this machine."
3. "This installs a small local connector for your machine, not for your repo."
4. "This install command is specific to the current Noter deploy."

Avoid saying:

1. "Add this to your package.json"
2. "Install the Noter SDK in your repo"
3. "Your machine is already connected" immediately after MCP auth

## Registration Mechanics

The install command should avoid manual token copy/paste if possible.

Preferred pattern:

1. browser issues a short-lived machine-registration token or URL
2. local installer consumes it
3. installer exchanges it for durable machine credentials

Acceptable fallback:

1. copy a one-time code from Noter into the CLI

This is still better than repo-level setup because it is explicit and
machine-scoped.

## Minimal Publish Shape

The current `public_ts` repo proves that a GitHub Actions based npm publish flow
works fine for scoped public packages, but the connected-machine installer does
not need the full monorepo release shape used there.

Recommended packaging shape:

1. package name: `@noter-md/sync`
2. one executable source file: `noter.js`
3. one `package.json` with `type: "module"`, `publishConfig.access: "public"`,
   and a single `bin` entry
4. no runtime dependencies unless the installer truly needs them

Recommended invocation:

```bash
npx @noter-md/sync connect --from https://<current-deploy>/noter.js
```

Recommended reason:

1. it preserves the "single polished script" feeling
2. it works with stock Node today
3. it keeps environment selection URL-scoped for previews and worktrees
4. it avoids `curl ... | node` trust concerns as the primary instruction
5. it is much simpler than asking users to copy a local `noter.js` file by hand

Suggested release automation:

1. keep the package in its own small package folder or repo
2. publish from GitHub Actions when the package version changes or when a tag is
   pushed
3. use `npm publish --access public` or an equivalent publish action
4. avoid introducing Turbo/workspace complexity unless more packages actually
   appear

Implementation decision:

1. keep the source in a private repo if desired
2. publish the npm tarball publicly
3. treat everything inside the tarball as public knowledge by design
4. use `noter.js` with module-mode configuration instead of relying on a `.mjs`
   extension

## Proposed MVP Package Layout

The first shipped package should stay intentionally small:

1. `package.json`
2. `noter.js`
3. `README.md`

Recommended `package.json` shape:

1. `name: "@noter-md/sync"`
2. `type: "module"`
3. `publishConfig.access: "public"`
4. exactly one `bin` entry so `npx @noter-md/sync connect` resolves cleanly
5. no runtime dependencies unless they are unavoidable

Recommended execution model:

1. `connect` is the only supported public command in the first release
2. the same file may contain internal subcommands for the long-running connector
   process, but the product docs should only expose `connect`
3. the executor should accept an explicit source URL, so preview deploys and
   production can share the same binary while selecting different environments
4. the package should be bundled or written as one file so install and review
   stay simple

## Proposed MVP Connect Flow

The first implementation should work like this:

1. user authenticates Noter from Codex
2. Noter lands them on a post-auth success page or `/machines/connect`
3. the page shows one command:

```bash
npx @noter-md/sync connect --from https://<current-deploy>/noter.js
```

4. the CLI verifies local prerequisites such as Node and Codex availability
5. the CLI opens the signed-in Noter browser flow or consumes a short-lived
   machine-registration token
6. the CLI creates a machine identity and stores Noter-owned local state under a
   Noter-owned directory outside repos
7. the CLI starts the connector immediately so the first heartbeat and thread
   sync happen during setup
8. once the first sync succeeds, Noter redirects or refreshes into the connected
   machine view

Phase 1 constraint:

1. OS-native background service installation is not required for the first
   public release
2. trusted reconnect and auto-start can follow once the basic connect flow is
   proven

## Preview Deploy And Multi-Worktree Behavior

Preview-scoped install URLs are a feature, not just a convenience.

Rules:

1. every production deploy and every preview deploy should be able to serve its
   own `noter.js`
2. the machine-connect UI should derive the copyable install command from the
   current page origin
3. machine-local state should record the install origin so multiple worktrees or
   preview environments can coexist on the same laptop
4. the installer should not assume one global machine target per account if the
   operator intentionally connects multiple worktrees

Rationale:

1. this makes branch previews and worktree testing much easier
2. it lets one laptop connect multiple experimental environments without
   republishing npm packages for every branch
3. it keeps the install experience aligned with Cloudflare Pages preview URLs
   that already exist in Noter workflows

## Local Port And Tunnel Rules

Preview-scoped installers create local routing concerns, so the first design
should avoid overcommitting to fixed localhost assumptions.

Rules:

1. do not require one fixed localhost port per connected machine environment
2. prefer outbound connector traffic plus browser token handoff over inbound
   local callbacks when possible
3. if a loopback callback is needed, prefer an ephemeral port instead of a
   hard-coded one
4. use Cloudflare Tunnel only when a preview or local environment truly needs
   inbound addressability from a stable URL
5. Cloudflare Tunnel is an escape hatch, not the default control plane

## Public And Private Boundary

The package should be transparent about what it does without exposing more than
it must.

Public by design:

1. installer and bootstrap logic
2. machine registration client flow
3. connector startup behavior
4. user-visible logging and status messages

Must remain server-side or otherwise non-client:

1. token minting rules
2. auth validation and revocation logic
3. abuse controls, rate limits, and fraud checks
4. operator-only admin paths
5. internal heuristics that do not need to run on the user's machine

Design rule:

1. if the user's machine must execute it, assume it is inspectable
2. if it must stay secret, move it behind a server boundary

## Relationship To Remodex

Remodex is useful here as a validation source, not as an architecture template.

Relevant takeaways:

1. machine-centric onboarding is correct
2. trusted reconnect after first registration is important
3. local bridge ownership should be explicit
4. rollout/session files can enrich later UX

What Noter should not copy in this slice:

1. custom relay-first architecture
2. custom E2EE transport as a prerequisite for the first install UX
3. iPhone-first product complexity before desktop machine onboarding is solid

## Open Questions

1. Should `https://<current-deploy>/noter.js` serve the literal bundled file, or
   should it redirect to versioned output or an install manifest?
2. What is the right machine-local state key for allowing multiple connected
   worktrees on one laptop without confusing the UI?
3. When should we add OS-native auto-start and service installation after the
   first public `connect` release?
4. Do we want QR pairing only for phone-originated machine connection, while
   desktop-originated flow uses browser token handoff instead?

## Acceptance Criteria For The Future Implementation

1. A user who authenticates Noter from Codex can tell whether they have only
   authenticated the plugin or also connected the machine.
2. The UI provides one clear next step for connecting the machine.
3. The default instruction does not require editing any repo `package.json`.
4. The default instruction is not Homebrew-only.
5. After first install, the machine appears in Noter and syncs thread summaries.

## Recommendation

Ship this in two layers:

1. Product UX:
   - MCP auth success branches into `Connect this machine` when needed
   - the same guidance also lives on a shared machine-connect screen in the app
2. Installer:
   - default to
     `npx @noter-md/sync connect --from https://<current-deploy>/noter.js`
   - keep the package intentionally small and dependency-light
   - treat the published tarball as public by design
   - let the current deploy URL choose the target environment or worktree

Then later replace the installer layer with a native desktop companion without
changing the product model.
