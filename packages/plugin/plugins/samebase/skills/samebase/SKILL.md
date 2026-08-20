---
name: samebase
description:
  Use Samebase to build, connect, change, publish, or operate repository-backed web apps across
  GitHub, Convex, and Cloudflare. Covers app inventory, provider setup and repair, browser handoff,
  repository work, deployment checks, logs, environment values, migrations, and domains.
---

# Samebase

## Scope

- Use Samebase only for repository-backed apps and provider resources attached to them.
- A Git-only request that does not mention Samebase or an attached provider is unrelated Git work.
  Do not call a Samebase tool to check whether its repository is connected.
- Do not use Samebase for standalone provider resources. Do not call app inventory first.
- For a deletion request, tell the user to use the Samebase dashboard. Do not call a Samebase or
  provider tool, including app inventory or browser handoff. Do not delete an attached resource.

## Route the request

- Choose the action from the user's request. Do not call authentication status or browser handoff as
  a preflight. A tool reports when it needs authorization.
- For app inventory, call only the Samebase app inventory.
- Treat `open @samebase` as an exact command that selects the in-app Browser. The user does not need
  to add `dashboard` or name the Browser plugin.
  1. Samebase authorization is required for a secure browser handoff. Do not call authentication
     status first.
  2. Select the in-app Browser. Do not select Chrome or another external browser.
  3. Call `create_browser_handoff` directly.
  4. If the action is unavailable or reports missing authorization, tell the user that authorization
     is required. Ask, `Would you like me to start authorization with Samebase?`
  5. Start authorization only after the user agrees. Wait for it to finish, then call
     `create_browser_handoff` again.
  6. Open the returned URL in the selected Browser before it expires.
- Use the same authorization and browser handoff steps for another request to open the Samebase
  dashboard. If the in-app Browser is unavailable, say so. Do not open Chrome.
- Use authentication status only when the user asks about authentication or a tool reports missing
  authentication.
- For all other Samebase work, follow the live MCP server and tool instructions. They define the
  current actions, arguments, and required order.

## Protect app identity

- Read app inventory before a Samebase write when a repository can already be connected.
- Reuse returned app, repository, provider account, and attachment identifiers without changing
  them. Treat identifiers as opaque.
- Create a new app only when the user needs one. Use a private repository unless the user requests a
  public repository.
- Source setup and provider setup are separate states. Source work can continue while provider setup
  is incomplete or failed.

## Approve provider writes

- Before a sequence can start or request a production build, state the repository, provider account,
  each possible production change, and whether Samebase will attach an existing resource or create a
  new one. Get explicit approval.
- Ask again if the target, effects, or approved scope changes.

## Work in the repository

- Work in the selected app's GitHub repository.
- Before editing, read its instructions, setup commands, lockfile, generated-file rules, and
  validation commands. Run the required setup and code generation.
- Validate the changed source. Commit or push only when the user asks to publish.

## Verify the result

- Reread Samebase inventory after an attachment, configuration, or repair action.
- Inventory reports Samebase workflow state and stable resource identifiers. Use provider tools for
  live state, logs, environment values, migrations, domains, and final build status when Samebase
  has no matching read.
- A started run, build request, commit, or push does not prove that a deployment is live.
- Never put credentials in Git, logs, screenshots, or responses. Report only verified state.
