# 073 Connected Machine Installer And Approval

## Status

- Research note with merged outcomes
- Current merged outcome: installer, browser approval, durable machine
  credentials, and presence are now on `main`
- Follow-on phone-control direction:
  `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`
- Scope: first-user internal MVP with a clear path to public npm distribution
- Related docs:
  - `specs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `specs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md`
  - `specs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`
  - `rfcs/070_NOTER_UI_PR_TRIGGERED_CODEX_LOCAL_AUTOMATION_RESEARCH.md`

## Decision Summary

Noter should treat hosted plugin auth and local machine connect as two separate
steps:

1. plugin auth gives the user access to hosted Noter tools
2. machine connect registers one local Codex instance as a Noter execution
   target

The installer model for this MVP should be:

1. machine-scoped, not repo-scoped
2. one canonical `noter.js` source file
3. that same file mirrored byte-for-byte into both the npm package entrypoint
   and the hosted `/noter.js` asset
4. one local config file per Codex instance at `~/.noter/config.json`
5. hosted-file-first for the first user, with `@noter-md/sync` added later as a
   thin public wrapper

The machine-connect page should stay intentionally small. Its job is not to
teach the whole system. Its job is to act as the browser-side checkpoint
between:

1. local bootstrap
2. signed-in Noter session
3. machine approval and credential issuance

## Problem

Noter now has three adjacent capabilities:

1. hosted MCP auth and consent for the Noter plugin
2. a local-only Codex app-server research browser
3. a connected-machine foundation that now ships machine approval, durable
   credentials, and presence in Convex

The user-facing bridge between them is still missing.

Today, a user can:

1. install the `noter.md` plugin in Codex
2. click `Authenticate`
3. sign in to Noter successfully

That does not yet mean:

1. this laptop is registered as a Noter machine
2. Noter may sync local Codex thread inventory from this laptop
3. Noter may later send remote work to this laptop
4. a local connector is installed and running

The onboarding gap is: what exactly should happen after plugin auth so the user
can actually see and control local Codex threads?

## Product Model

The correct mental model is:

1. plugin auth is account-level and hosted
2. machine connect is machine-level and local

These compose, but they are not the same action and they must not share the same
long-lived credential.

Implications:

1. do not tell the user that successful plugin auth means the machine is now
   connected
2. do not ask the user to edit a repo `package.json`
3. do not make Homebrew the default
4. do not reuse MCP OAuth access tokens as machine credentials

## Why The Installer Is Not Repo-Scoped

The connected-machine connector does not belong in an application repo.

Reasons:

1. it is machine-scoped, not repo-scoped
2. one machine may serve many repos and many Codex threads
3. asking the user to install it in each repo creates drift and duplication
4. repo dependencies imply app-runtime or repo-tooling ownership, which is false
   here
5. machine state belongs in a Noter-owned directory outside repos

Conclusion:

1. `package.json` is the wrong install surface for the first-user flow

## Distribution Model

We want one underlying installer file with two distribution channels.

### Channel A: Hosted `noter.js`

This is the current first-user and iteration path.

Shape:

```bash
curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'
```

Preview or local iteration uses the same shape with a different origin:

```bash
curl -fsSL 'https://preview.noter.md/noter.js' | node --input-type=module - connect 'https://preview.noter.md/noter.js'
```

Why this is the right first step:

1. it lets one deploy own its own installer URL
2. it makes preview and worktree iteration easy
3. it avoids waiting on npm publishing before the flow is usable
4. it keeps the real source artifact visible and inspectable

### Channel B: Published npm package

This is the later public path once the package is actually published.

Shape:

```bash
npx @noter-md/sync connect
```

The important rule is that the npm package should remain a thin wrapper around
the same installer logic that powers the hosted file. We do not want separate
implementations.

## Why Homebrew Is Not The Default

Homebrew can exist as an optional install channel later, but it should not be
the default.

Reasons:

1. it is macOS-first
2. it assumes more operator setup than a product-owned bootstrap script
3. it does not help preview deploy iteration
4. it is a worse fit than Node for the current single-file installer direction

Conclusion:

1. Homebrew is optional, not primary

## Hosted Script Requirements

Each deploy should serve its own `noter.js`.

Rules:

1. production serves `https://noter.md/noter.js`
2. each preview deploy serves its own `https://<preview>/noter.js`
3. local dev can serve `http://127.0.0.1:5174/noter.js`
4. the hosted file should stay byte-for-byte identical to the package entrypoint
5. production direct execution should rely on the built-in default source URL
6. preview or local targeting should come from the direct command itself, not
   from mutating the file contents per deploy

This keeps the audit story simpler:

1. a user can inspect one canonical script shape
2. Codex or another reviewer does not need to reason about a separately stamped
   hosted variant
3. preview and worktree targeting stays explicit only when the operator opts
   into the override form

## MVP Trust And Provenance

For this first-user slice, the trust model is intentionally pragmatic.

We are not trying to solve full public artifact provenance yet.

The current assumption is:

1. the first user is the operator building the flow
2. downloading directly from `https://noter.md/noter.js` or a trusted preview
   deploy is acceptable for now
3. the script should be transparent about what it does and keep the hosted copy
   identical to the package source

If we want a visible version marker later, it should be a small manual comment
inside the installer source itself, for example:

```js
// noter-sync-version: <sha-or-tag>
```

Rules for that marker:

1. it should change only when the installer file itself changes
2. it should describe the installer artifact, not the whole app deploy
3. it should not be auto-stamped per deploy, preview, or unrelated repo commit
4. the hosted file and the package file should still mirror that exact comment
   byte-for-byte

This RFC does not require:

1. signed artifacts
2. checksum verification UX
3. detached provenance manifests
4. package-signing policy

Those can be added later if public distribution or broader trust requirements
justify them.

## Local Config Model

For the MVP, one Codex instance should map to one local Noter installation.

The installer should write a single config file:

```text
~/.noter/config.json
```

Minimum state for the first slice:

1. `sourceUrl`
2. `codexVersion`
3. `installedAt`
4. `updatedAt`

Important behavior:

1. rerunning the bootstrap updates the same file
2. the config records the current installer source URL
3. switching from prod to a preview or local deploy should overwrite that one
   config file, not create parallel installation records
4. derivable values such as `sourceOrigin` or the machine-connect URL do not
   need to be stored in the file

This keeps the MVP aligned with the user mental model:

1. one Codex instance
2. one Noter installation
3. one local config file

## Machine Auth And Approval

Machine auth should reuse the browser session, not the MCP OAuth token.

Recommended flow:

1. the local script opens a browser handoff into Noter
2. the browser uses the existing signed-in Noter session
3. the user explicitly approves this machine
4. Noter issues a machine-specific bootstrap credential
5. the local connector stores that credential under Noter-owned machine state

Do not:

1. reuse MCP OAuth access tokens as machine credentials
2. treat an MCP auth-request row as the machine identity
3. couple machine revocation to plugin revocation

The right mental model is closer to device auth than to repo auth.

## Connect Flow

### Current first-user flow

1. user authenticates the Noter plugin in Codex
2. Noter shows `Connect this machine`
3. the user runs the hosted `noter.js` from the deploy they care about
4. the script:
   - validates its own source URL
   - checks that `codex` is installed
   - writes or updates `~/.noter/config.json`
   - prints markdown status to the terminal
   - opens `/machines/connect?openedByCli`
5. the browser page uses the current session to continue approval
6. Noter issues machine credentials
7. the connector starts and performs first heartbeat publishing
8. the machine appears in Noter

### Later public flow

Once `@noter-md/sync` is published, the same flow becomes:

1. user runs `npx @noter-md/sync connect`
2. the package executes the same installer logic
3. if needed, the package can still point the user back to the hosted `noter.js`
   as the canonical inspectable artifact

## What The Machine-Connect Page Is For

The page exists for product flow control, not for long-form explanation.

It gives us:

1. a stable URL the CLI can open after bootstrap
2. a signed-in browser checkpoint for machine approval
3. an in-app starting point when the user initiates from the dashboard instead
   of the terminal

It should remain intentionally thin:

1. one short sentence
2. the package command
3. the direct hosted-file command
4. an optional direct link to `noter.js`
5. approval UI once the browser handoff is active

It should not become a long documentation page.

## Preview And Worktree Iteration

This design is still deploy-scoped, but the local state is intentionally not
multi-install.

Rules:

1. the direct hosted-file command determines which deploy the bootstrap targets
2. there is no `--from` override flag in the public CLI contract
3. rerunning the bootstrap against another deploy updates `~/.noter/config.json`
   to that new source URL
4. the operator can iterate on prod, preview, or local worktrees without
   republishing npm, but only one source URL is active in the local config at a
   time

For now, the machine-connect UI may continue to show the explicit-URL form even
though production users can use the shorter default command. That is only a UI
copy choice, not a different runtime model.

This keeps the iteration story strong without forcing multi-install complexity
into the MVP.

## Public And Private Boundary

The published or hosted installer file is public by definition.

Public by design:

1. bootstrap logic
2. machine registration client flow
3. connector startup behavior
4. terminal status output

Keep server-side:

1. token issuance rules
2. auth validation and revocation logic
3. abuse controls and rate limits
4. admin-only operations
5. internal heuristics that do not need to execute on the user machine

Rule:

1. if the machine must execute it, assume the user can inspect it
2. if it must stay secret, keep it server-side

## Relationship To Remodex

Remodex is useful as validation, not as a blueprint.

Useful takeaways:

1. machine-centric onboarding is the right model
2. trusted reconnect matters
3. local bridge ownership should be explicit
4. session or rollout files can enrich later UX

What we should not copy for this slice:

1. a custom relay-first architecture
2. custom E2EE as an MVP prerequisite
3. a broader mobile-control product before the machine bootstrap is solid

## Out Of Scope For This RFC

1. signed artifact distribution
2. full package publishing automation
3. OS-native auto-start or service installation
4. QR pairing
5. remote command execution details beyond the bootstrap and approval contract

## Acceptance Criteria

1. A user can tell the difference between authenticating the plugin and
   connecting the machine.
2. The first-user path works without publishing npm first.
3. The installer is machine-scoped and does not require repo edits.
4. The hosted file is inspectable and stays byte-for-byte identical to the
   package entrypoint.
5. The local bootstrap state lives in one config file at `~/.noter/config.json`.
6. The browser handoff is positioned as machine approval, not generic docs.
7. The same underlying installer logic can later ship through `@noter-md/sync`.

## Recommendation

Ship this in two layers:

1. Internal MVP now:
   - use the hosted `noter.js` file directly
   - keep the machine-connect page thin
   - use browser-backed machine approval
   - store one local config file per Codex instance
2. Public distribution next:
   - publish `@noter-md/sync`
   - keep it as a thin wrapper over the same file
   - let npm provide the cleaner public command once the package actually exists

This keeps the first-user path fast and iteratable while preserving the public
product shape we want later.
