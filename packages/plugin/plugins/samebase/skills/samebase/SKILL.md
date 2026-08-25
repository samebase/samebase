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
  the user can do it and offer to open the dashboard. Call `create_browser_handoff` only after the
  user accepts. Do not claim that the operation finished.
- Choose the action from the user's request. Follow the live MCP server and tool instructions for
  the current actions, arguments, effects, and required order.
- Call only the actions needed for that route. Do not read app or authentication state as a generic
  preflight.
- Never offer feedback for a standalone GitHub, Convex, Cloudflare, or agent problem.
- When the feedback action is available, offer once without being asked after an unexpected Samebase
  failure, a wrong Samebase result, or clear frustration with Samebase or its plugin. Draft a short
  report that states what the user tried, what happened, and what should improve. Show the exact
  report, then say,
  `I can automatically send this exact report to Samebase. No form is needed, and nothing is sent unless you approve. Send it?`

## Recover missing actions

- If the Samebase skill loads but Samebase actions are not registered, report that the local Codex
  plugin or MCP connection is not ready. Absent actions do not prove missing authorization.
- Open a Samebase URL only when Codex starts plugin OAuth or `create_browser_handoff` returns it.
  Never open the public Samebase site, Chrome, or the in-app Browser as a fallback.
- In Codex, run `codex plugin list --json` when the local CLI works. Do not use ChatGPT plugin
  state, search for another Codex executable, copy an executable, or use browser, curl, or manual
  MCP requests to replace missing actions.
- If `samebase@samebase` is not installed or enabled, ask the user to install or enable that entry.
  If it is installed and enabled but actions remain absent in a fresh task, ask the user to open
  Codex Plugins, uninstall that direct-marketplace entry, install it again, complete the OAuth flow
  started by installation, fully restart Codex, and start a new task. Do not remove another Samebase
  entry.
- If other Samebase actions are registered but `create_browser_handoff` is absent, explain that the
  current connection does not grant the handoff action. Ask before starting authorization through
  the Codex plugin or connection flow. Do not reinstall the plugin when its other actions work.
- If actions are still absent after that recovery, report that the MCP connection did not register
  and stop. Do not recommend Full Access or repeated OAuth.

## Open Samebase

- Treat `open @samebase` and another request to open the Samebase dashboard as a request to use the
  in-app Browser.
  1. If `create_browser_handoff` is absent, follow Recover missing actions.
  2. Call `create_browser_handoff` directly. Do not call authentication status first.
  3. If the callable action reports missing authorization or scope, explain the requirement. Ask,
     `Would you like me to start authorization with Samebase?`
  4. Start authorization only through the Codex plugin or connection flow after the user agrees.
     Wait for it to finish, then call `create_browser_handoff` again.
  5. Select the in-app Browser. Do not select Chrome or another external browser.
  6. Open only the URL returned by `create_browser_handoff`, before it expires.
- If the in-app Browser is unavailable, say so. Do not open Chrome.
- Use authentication status only when the user asks about authentication or a tool reports missing
  authentication.

## Protect app identity

- Read app inventory before a Samebase write when a repository can already be connected.
- For managed app creation, read inventory first, then list the selected organization's current
  Workers Builds tokens. Follow the token action's selection rule, call the create action once, and
  poll only inventory until source and provider setup reach `ready` or `failed`. Stop and report a
  failed state. When creation used a null token, report Cloudflare setup as pending after the other
  setup reaches `ready`.
- Reuse returned app, repository, provider account, and attachment identifiers without changing
  them. Treat identifiers as opaque.
- Source setup and provider setup are separate states. Source work can continue while provider setup
  is incomplete or failed.

## Approve provider writes

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
