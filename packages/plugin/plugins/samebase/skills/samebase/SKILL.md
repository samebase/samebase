---
name: samebase
description:
  Use Samebase to create and manage web apps with a GitHub repository and optional Convex and
  Cloudflare resources. Use when the user asks to list, create, connect, configure, repair, open,
  publish, or operate a Samebase app, or submit feedback about Samebase.
---

# Samebase

## Choose the control surface

- Use Samebase actions to list apps, create or connect an app repository, attach or repair provider
  resources for a Samebase app, and open the Samebase dashboard.
- Use GitHub, Convex, or Cloudflare tools for direct work in those systems. For a standalone
  provider resource, use only provider tools and do not propose a Samebase workflow. A provider
  action does not change the Samebase app unless the action says that it does.
- When Samebase actions are registered but no action supports the requested operation, explain where
  the user can do it and offer to open the dashboard. Do not read inventory or call an action before
  the user accepts. Then call only `create_browser_handoff`. Do not claim that the operation
  finished.
- Choose the action from the user's request. Follow the live MCP server and tool instructions for
  the current actions, arguments, effects, and required order.
- For a request about Samebase connection or authentication status, call the authentication-status
  action directly. Do not read app inventory.
- Call only the actions needed for that route. Do not read app or authentication state as a generic
  preflight.
- Never offer feedback for a standalone GitHub, Convex, Cloudflare, or agent problem.
- When the feedback action is available, offer once without being asked after an unexpected Samebase
  failure, a wrong Samebase result, or clear frustration with Samebase or its plugin. Draft a short
  report that states what the user tried, what happened, and what should improve. Show the exact
  report, then say,
  `I can automatically send this exact report to Samebase. No form is needed, and nothing is sent unless you approve. Send it?`

## Open Samebase

- Treat `open @samebase` and another request to open the Samebase dashboard as a request to use the
  in-app Browser.
  1. If `create_browser_handoff` is absent, follow Recover missing actions for the current client.
  2. Call `create_browser_handoff` directly. Do not call authentication status first.
  3. If the callable action reports missing authorization or scope, explain the requirement. Ask,
     `Would you like me to start authorization with Samebase?`
  4. Start authorization only through the current plugin or connection flow after the user agrees.
     Wait for it to finish, then call `create_browser_handoff` again.
  5. Select the in-app Browser. Do not select Chrome or another external browser.
  6. Open only the URL returned by `create_browser_handoff`, before it expires.
- If the in-app Browser is unavailable, say so. Do not open Chrome.

## Protect app identity

- Read app inventory before a Samebase write when a repository can already be connected.
- For managed app creation, read inventory first, then list the selected organization's current
  Workers Builds tokens. Use the last-used token when available, use the sole token, ask the user to
  choose when several tokens exist, or pass null only when the list is empty. Call the create action
  once, then poll only inventory until source and provider setup reach `ready` or `failed`. Stop and
  report a failed state. When creation used a null token, report Cloudflare setup as pending after
  the other setup reaches `ready`.
- Reuse returned app, repository, provider account, and attachment identifiers without changing
  them. Treat identifiers as opaque.
- Source setup and provider setup are separate states. Source work can continue while provider setup
  is incomplete or failed.

## Approve provider writes

- A direct request to create a Samebase app approves one managed creation sequence after inventory
  and token selection. State the resolved repository, provider account, and effects before the
  create call, but do not ask again unless the target, effects, or scope changes.
- Before a Samebase sequence can create or change provider resources or start a production build,
  state the repository, provider account, expected changes, and whether Samebase will attach an
  existing resource or create a new one. Get explicit approval.
- Ask again if the target, effects, or approved scope changes.

## Work in the repository

- Use the selected app's GitHub repository for code work. Follow its instructions and validation
  commands.

## Verify the result

- Reread Samebase inventory after an attachment, configuration, or repair action.
- Inventory reports Samebase workflow state and stable resource identifiers. Use provider tools for
  live state, logs, environment values, migrations, domains, and final build status when Samebase
  has no matching read.
- A started run, build request, commit, or push does not prove that a deployment is live.
- Never put credentials in Git, logs, screenshots, or responses. Report only verified state.

## Recover missing actions

- If the skill loads but Samebase actions are absent, report that the current client's plugin or MCP
  connection is not ready. Absence does not prove missing authorization. Use only the current
  client's state.
- Open a Samebase URL only when the current client starts plugin OAuth or `create_browser_handoff`
  returns it. Do not use the public site, a browser, another client's state, curl, or manual MCP
  requests as a fallback.

### Codex

- If version 0.2.26 was verified and reinstall, installation OAuth, full restart, and a new task are
  complete, report that the MCP connection did not register and stop. Do not repeat recovery.
- With a working CLI, run `codex plugin marketplace upgrade samebase`, then
  `codex plugin list --available --json`, and verify that 0.2.26 is available. Otherwise, refresh
  the Samebase marketplace in Codex Plugins and verify 0.2.26 there. Do not hunt for or copy a Codex
  executable.
- Install or enable an absent or disabled `samebase@samebase` entry. If the current direct entry is
  enabled but actions remain absent in a fresh task, uninstall only that entry, install it again,
  complete installation OAuth, fully restart Codex, and start a new task. Verify installed version
  0.2.26. Do not remove another Samebase entry.
- When other Samebase actions work but handoff is absent, ask before using Codex connection
  authorization. Do not reinstall. Do not recommend Full Access or repeated OAuth.

### Claude Code and ChatGPT

- In Claude Code, inspect `/plugin`, then use `/plugin marketplace update samebase`,
  `/plugin update samebase@samebase`, and `/reload-plugins`. Use `/mcp` only for a reported
  authorization error. If actions remain absent after reload, report the registration failure and
  stop.
- In ChatGPT, use only ChatGPT Plugins controls to update or reconnect Samebase, then start a new
  chat. Authorize only after ChatGPT or a callable action reports an authorization error. If actions
  remain absent, report the registration failure and stop. Never use another client's state.
