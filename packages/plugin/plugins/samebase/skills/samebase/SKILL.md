---
name: samebase
description:
  Use Samebase to create and manage web apps in Samebase repositories: a GitHub repository with
  optional Convex projects and Cloudflare Workers. Use when the user asks to list, create, connect,
  configure, repair, open, publish, or operate a Samebase repository or app, review or apply changes
  from the starter changelog, or submit feedback about Samebase.
---

# Samebase

## Choose the control surface

- Use Samebase actions to list repositories, create or connect a repository, find, attach, connect,
  create, repair, or detach its Cloudflare Workers and Convex projects, and open the Samebase
  dashboard.
- Use GitHub, Convex, or Cloudflare tools for direct work in those systems, including logs,
  environment values, and live build and deployment state. For a standalone provider resource, use
  only provider tools and do not propose a Samebase workflow. A provider action does not change the
  Samebase repository unless the action says that it does.
- When Samebase actions are registered but no action supports the requested operation, explain where
  the user can do it and offer to open the dashboard. Do not read the repository list or call an
  action before the user accepts. Then call only `account_createSignInLink`. Do not claim that the
  operation finished.
- Choose the action from the user's request. Follow the live MCP server and tool instructions for
  the current actions, arguments, effects, and required order.
- If a required Samebase action is absent, read
  [Recover missing actions](references/recover-missing-actions.md).
- For a request about Samebase connection or authentication status, call
  `account_getAuthenticationStatus` directly. Do not read the repository list.
- Call only the actions needed for that route. Do not read the repository list or authentication
  state as a generic preflight.
- Never offer feedback for a standalone GitHub, Convex, Cloudflare, or agent problem.
- When the feedback action is available, offer once without being asked after an unexpected Samebase
  failure, a wrong Samebase result, or clear frustration with Samebase or its plugin. Draft a short
  report that states what the user tried, what happened, and what should improve. Show the exact
  report, then say,
  `I can automatically send this exact report to Samebase. No form is needed, and nothing is sent unless you approve. Send it?`

## Open Samebase

- For `open @samebase` or another request to open the Samebase dashboard:
  1. If `account_createSignInLink` is absent, read
     [Recover missing actions](references/recover-missing-actions.md).
  2. Call `account_createSignInLink` directly. Do not call authentication status first.
  3. If the callable action reports missing authorization or scope, explain the requirement. Ask,
     `Would you like me to start authorization with Samebase?`
  4. Start authorization only through the current plugin or connection flow after the user agrees.
     Wait for it to finish, then call `account_createSignInLink` again.
  5. In Codex, use the in-app Browser unless the user names another browser.
  6. In ChatGPT web or mobile, present the returned URL as a clickable link. If the current client
     provides a browser-opening action, use it when the user asks to open the dashboard.
  7. Use only the returned URL before it expires. If no browser-opening action is available, present
     the link without claiming that the dashboard opened.

## Name repositories and resources

- Name a repository by its GitHub full name, `owner/name`, or by the `repositoryId` from
  `repository_list`. Name Workers and Convex projects by the names that Samebase returns. Never
  invent IDs.
- Read `repository_list` before a write when the repository can already be connected.
- Samebase picks the Workers Builds token, the only Convex code location, and the only attached
  Convex project. When a result lists choices, ask the user and pass the choice in the next call.
- Repository creation uses these steps:
  1. Resolve the Convex production region. Pass `aws-us-east-1` for US. Before you pass
     `aws-eu-west-1` for EU, state,
     `EU usage costs 1.3 times US usage. Included usage for Starter and Professional plans does not apply to EU deployments.`
     Link to [Convex pricing](https://www.convex.dev/pricing). Otherwise, omit the region; Samebase
     uses the organization default, or US when none is saved.
  2. Call `repository_create` once.
  3. Poll only `repository_list` until both source and provider setup reach `ready` or `failed`.
     Stop and report a failed state.
  4. When the result reports Cloudflare as pending, `ready` covers only the GitHub and Convex work.
     Report Cloudflare setup as pending and link to
     [Cloudflare setup](https://samebase.com/docs/cloudflare-setup). After the user finishes it,
     `repository_cloudflare_createWorker` completes the first app.
- Source setup and provider setup are separate states. Source work can continue while provider setup
  is incomplete or failed.

## Approve provider writes

- A direct request to create a Samebase repository approves one creation sequence. State the GitHub
  owner and repository name, the Convex production region you pass (or the organization default),
  the Convex project and Worker names, and the effects before the call. Do not ask again unless the
  target, effects, or scope changes.
- Before a Samebase action can create or change provider resources or start a production build,
  state the repository, the resource, the expected changes, and whether Samebase attaches an
  existing resource, connects it, or creates a new one. Get explicit approval.
- `repository_cloudflare_connectWorker` replaces what the Worker serves.
  `repository_cloudflare_rotateConvexDeployKeys` and `repository_retryProviderSetup` revoke and
  replace deploy keys. `repository_detachResource` removes an attachment. Tell the user the effect
  and get approval before each, unless the request already approves that effect.
- Ask again if the target, effects, or approved scope changes.

## Work in the repository

- Use each selected repository's GitHub repository for code work. Follow its instructions and
  validation commands.
- For a request to review or apply newer Samebase starter changes, read the
  [Samebase starter changelog](references/starter-changelog.md).
- When the request covers several or all apps, read `repository_list` once and use every returned
  repository as the review scope. Inspect each GitHub repository separately and report each as
  `update needed`, `already current`, `not relevant`, or `unavailable`.
- Apply changes only when the user asks. Use GitHub tools and a separate branch and pull request for
  each repository. The Samebase repository list selects the repositories but does not change their
  code.

## Verify the result

- Reread `repository_list` after an attachment, connection, creation, or repair action.
- The repository list reports Samebase workflow state and attachment names. Use provider tools for
  live state, logs, environment values, migrations, domains, and final build status.
- A started run, build request, commit, or push does not prove that a deployment is live.
- Never put credentials in Git, logs, screenshots, or responses. Report only verified state.
