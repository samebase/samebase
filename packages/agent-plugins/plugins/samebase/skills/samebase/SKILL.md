---
name: samebase
description:
  Build, connect, change, publish, or operate Samebase web apps through GitHub, Convex, and
  Cloudflare. Use for Samebase app inventory, provisioning, provider attachment, repair, browser
  handoff, repository work, deployment checks, logs, environment values, migrations, and domains.
---

# Samebase

Use Samebase for repository-backed apps and work that joins GitHub, Convex, and Cloudflare. Do not
use Samebase for Git-only work or standalone provider resources.

## Select the app

1. Read the Samebase app inventory before a Samebase write.
2. Reuse the exact app, repository, and attachment IDs. Treat all returned IDs as opaque.
3. Create a new app only when the user needs one. Use a private repository unless the user asks for
   a public repository.
4. Connect an existing GitHub repository when it is not in Samebase. A connection does not attach
   Convex or Cloudflare.
5. Use browser handoff directly when the user asks to open Samebase.

Use the live MCP tool descriptions for exact names and arguments. Match an inventory `nextAction` to
its action contract at [samebase.com/llms.txt](https://samebase.com/llms.txt). Do not guess a tool
name from the action ID.

## Create an app

Use this exact sequence for a new app:

1. Read the Samebase app inventory.
2. Create the app.
3. Read the inventory until source setup is `ready` or `failed`.
4. If source setup is ready, read the inventory until provider setup is separately `ready` or
   `failed`.

Authentication status and provider-account reads are not preflight steps in this creation flow. Use
authentication status only when the user asks about authentication or a tool reports missing
authentication.

## Verify state

- Treat source setup and provider setup as separate states. Source work can continue while provider
  setup is incomplete.
- Reread inventory after each attachment, configuration, or repair action.
- A started run, requested build, commit, or push is not proof of a live deployment.

## Work in the repository

Use the app's GitHub repository as the source of truth. Clone it when needed. Read its instructions,
setup commands, lockfile, generated-file policy, and validation commands before editing. Run its
setup and code generation steps. Validate the final source. Commit or push only when the user asks
to publish.

For stack-alignment work, first compare the target repository with the current generated-app
contract: Node 24, package `"type": "module"`, and normal `.ts` files for handwritten Node
automation run directly by Node. Type-check that automation in normal checks and the real build.
Record each intentional difference before implementation.

## Use the correct control surface

Use Samebase for app inventory, provider joins, and explicit repair actions. Use provider-native
tools for live provider state, logs, environment values, migrations, domains, and terminal build
state when no Samebase tool exposes that read or action.

The plugin cannot delete a Samebase app or its attached provider resources. Direct the user to the
Samebase dashboard. Do not call any MCP tool for the deletion request. Do not delete these resources
with provider-native tools.

Keep credentials out of Git, logs, screenshots, and responses. Report only states that you verified.
