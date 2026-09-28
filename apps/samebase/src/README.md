# Samebase Web App Map

Code lives with the feature that owns it. Tests and visual fixtures sit beside the code they cover.
Route files stay thin and import the feature page.

## Features

- `account/`: user settings, MCP client settings, and account deletion.
- `admin/`: operator pages for users and account deletions.
- `agentAccess/`: MCP consent and the agent browser handoff page.
- `appShell/`: root client, workspace shell, sidebars, route access and availability outlets,
  approval and terms gates, boot recovery, and not-found and error pages.
- `auth/`: sign-in, the auth client, auth presentation state and prehydration, and provider
  authorization error and completion notices.
- `browserStorage/`: the localStorage and IndexedDB inspector pages.
- `editors/`: Monaco, CodeMirror, and ProseMark editor surfaces and their configuration.
- `logo/`: logo scenes, logo research pages, landing logo, and generated logo assets.
- `organization/`: organizations, members, invitations, billing, and `providers/` connections.
- `publicSite/`: landing, docs, pricing, pitch deck, legal pages, and the public account section.
- `repository/`: `dashboard/`, `editor/`, `setup/`, `database/`, `schemaGraph/`, and repository
  route helpers.

## Routing

- `routes.ts` declares the virtual route tree. `routes/` holds one thin file per route, and
  `routeTree.gen.ts` is generated.
- `routeSearch/` owns typed search params per route. `routing/` owns route permissions,
  availability, and the URL editor address model.

## Shared Code

- `components/`: shared app components, the route URL editor, and generated shadcn `ui/` primitives.
- `lib/`: cross-feature infrastructure such as the Convex client and query cache, page and build
  metadata, search param helpers, theme, and analytics.
- `hooks/` and `contexts/`: small shared React hooks and the dialog context.
- `content/`: Markdown for public pages. `test/`: shared test setup.
