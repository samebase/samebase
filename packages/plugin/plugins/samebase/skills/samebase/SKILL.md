---
name: samebase
description:
  Build, connect, change, publish, and operate repository-backed web apps with Samebase across
  GitHub, Convex, and Cloudflare. Covers app inventory, provisioning, provider setup and repair,
  browser handoff, repository work, deployment checks, logs, environment values, migrations, and
  domains.
---

# Samebase

## When to use Samebase

- Use Samebase only for repository-backed apps and provider resources attached to them.
- Do not use Samebase for unrelated Git work or standalone provider resources. A standalone
  Cloudflare Worker means no Samebase.
- For a deletion request, send the user to the Samebase dashboard. Do not call a Samebase or
  provider tool. This ban includes app inventory and browser handoff. Do not delete an attached
  resource.

## Route the request

Choose the needed action before you read live tool descriptions. Do not make a preflight call. If an
action needs authentication, it reports that requirement.

- For app inventory, call only the Samebase app inventory. Do not call authentication status or
  browser handoff first.
- For the Cloudflare account list, call only that list. Do not call app inventory, authentication
  status, or browser handoff first.
- Treat `open @samebase` as an exact command. It selects the in-app Browser. The user does not need
  to add `dashboard` or name the Browser plugin.
  1. The user must authorize Samebase before you create a secure browser handoff. If authorization
     is missing or `create_browser_handoff` is unavailable, tell the user that authorization is
     required. Ask, `Would you like me to start authorization with Samebase?` Do not suggest a
     plugin reload or reinstall. Wait for authorization to finish before you continue.
  2. Select the in-app Browser. Do not select Chrome or a different external browser.
  3. Call `create_browser_handoff`.
  4. Open the returned URL in the selected in-app Browser before it expires. The URL opens a
     Samebase session for the account that granted the current MCP access, then opens the dashboard.
- Use steps 1 through 4 for any other request to open the Samebase dashboard. If the in-app Browser
  is unavailable, say so. Do not open Chrome.
- Use authentication status only when the user asks about authentication or after an action reports
  missing authentication.
- For a new app, follow these steps in order. Do not make any other tool calls:
  1. Read the app inventory.
  2. Call `cloudflare_listWorkersBuildTokens` for the selected organization.
  3. Set the required `cloudflareBuildTokenUuid`.
     - If the current list is confirmed empty, set it to null.
     - If `lastUsedBuildTokenUuid` is available, set it to that UUID without asking.
     - If the list has one token, set it to that UUID.
     - If the list has several tokens and no last-used token, ask the user to choose by name and
       UUID. Set the field to that UUID.
     - Do not omit the field.
  4. Create the app with `cloudflareBuildTokenUuid` set to this value.
  5. Read only the inventory until source setup is `ready` or `failed`.
  6. After source setup is ready, read only the inventory until provider setup is `ready` or
     `failed`.
  7. Do not call authentication status, browser handoff, or the Cloudflare account list. The
     complete tool sequence is inventory, the Workers Builds token list, create, and inventory
     polls. Call create immediately after token selection. Do not call another tool between the
     token list and create. Create has no `accountId` and uses the connected Cloudflare provider.
  8. If `cloudflareBuildTokenUuid` is null, the managed run creates the GitHub repository and Convex
     project. It does not create a Cloudflare Worker. A ready provider setup means that the run
     finished. It does not mean that the full app is ready. Confirm that the planned Convex project
     is attached and `cloudflareWorkers` is empty. Tell the user that Cloudflare setup is pending
     and give them [samebase.com/docs/cloudflare-setup](https://samebase.com/docs/cloudflare-setup).
     Do not call the app ready, attach a temporary Worker, or retry the finished run.
  9. The user completes Cloudflare's standard repository setup to create the first account token,
     then deletes the temporary Worker. When the user asks to finish the app, list the current
     tokens, call `vault_cloudflare_createWorker` with one UUID from that list, reread inventory,
     then call `vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds` with the new Worker and the
     attached Convex project.
- For manual Cloudflare Worker creation or Workers Builds configuration, first call
  `cloudflare_listWorkersBuildTokens`. Never pass null to a manual Worker or Builds action. Pass
  only an exact UUID from the current non-empty list. If the list is empty, stop the write and use
  current inventory to select the next action:
  - For the tokenless managed app with its exact planned Convex project and no attached Worker, use
    [samebase.com/docs/cloudflare-setup](https://samebase.com/docs/cloudflare-setup). After setup,
    refresh the token list, call `vault_cloudflare_createWorker` with one UUID from the refreshed
    list, reread inventory, then call `vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds`.
  - When a Worker is already attached, keep it. After token setup, refresh the token list and call
    `vault_cloudflare_configureWorkersBuildsForGitHub` for that attachment. Do not create another
    Worker.
  - For any other app, complete token setup, refresh the token list, and continue only with the
    action that matches the request and current inventory. Worker creation does not install Convex
    deploy keys.

After you choose the action, read live tool descriptions only to get its tool name and arguments.
Follow the inventory `nextAction` contract at
[samebase.com/llms.txt](https://samebase.com/llms.txt). Do not infer a tool name from an action ID.
Do not copy tool schemas into this skill.

## Select the app

1. Before a Samebase tool changes an app, read the app inventory.
2. Reuse the returned app, repository, and attachment IDs without changing them. Treat the IDs as
   opaque.
3. Create a new app only when the user needs one. Use a private repository unless the user asks for
   a public repository.
4. If an existing GitHub repository is not in Samebase, connect it at the start of adoption. This
   records the source state. It does not attach Convex or Cloudflare.

## Verify state

- Source setup and provider setup are separate states. Source work can continue while provider setup
  is incomplete.
- By default, prepare the repository before provider setup can start a production build. For an
  experimental app, the operator can approve earlier provider setup. If the resulting build fails,
  use the failure and provider logs to diagnose the setup. Do not report it as a deployment. Use the
  [existing repository adoption reference](references/existing-repository-adoption.md) to decide the
  timing and check previews before the first deployment.
- Reread inventory after each attachment, configuration, or repair action.
- A started run, build request, commit, or push does not prove that a deployment is live.
- Before a write sequence can start or request a production build, tell the operator what can change
  in production and get explicit approval. One approval can cover the sequence only if you first
  state the repository, provider account, each possible production change, and whether Samebase will
  attach an existing resource or create a new one. Ask again if any of these facts or the approved
  scope changes.

## Work in the repository

Work from the app's GitHub repository. Clone it when needed. Before editing, read its instructions,
setup commands, lockfile, generated-file rules, and validation commands. Run its required setup and
code-generation steps. Validate the changed source. Commit or push only when the user asks to
publish.

Before stack-alignment work, read the current main branch of
[samebase/app](https://github.com/samebase/app). Use it as the public reference for a Samebase-ready
repository with the minimum required setup. Compare the runtime, package manager, commands, type
checks, lint and format rules, tests, framework and deployment adapters, CI, and shared version
pins. Classify each difference as alignment, a required target constraint, an item to investigate,
or a tested exception. Keep a target difference when tests or runtime behavior require it. If that
evidence shows that samebase/app should also change, tell the operator why. Do not edit that
repository without authorization.

Match the validation scope to the project and migration risk. Before broad or expensive tests,
discuss their cost and expected coverage with the operator. Do not change tests or their setup
unless Samebase adoption requires it.

Review every authored `.js`, `.mjs`, and `.cjs` file and every direct ESLint, Prettier, Vitest, or
Vite runner against the Samebase defaults. Keep an exception only when one named tool or runtime
cannot use TypeScript and Vite+. Document that limit. Do not add a repository scanner only to ban
file extensions or runner names.

## Choose Samebase or provider tools

Use Samebase for app inventory, provider attachments, and requested repair actions. Use each
provider's tools for live state, logs, environment values, migrations, domains, and final build
status when Samebase has no matching read or action.

Never put credentials in Git, logs, screenshots, or responses. Report only what you verified.
