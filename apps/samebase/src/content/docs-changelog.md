# Changelog

What changed in Samebase, newest first. Each `v` number is the Samebase version that shipped the
change. If a change needs action from you, the entry says so.

## 2026-11-09

- **v2325: One hub client per deployment, with a list of return addresses.** A deployment now
  registers one client at the identity hub that lists every address the hub may send people back to,
  in `@samebase/alchemy-convex` 0.39.1 as `redirectUris`. The `app` name is optional and defaults to
  the stack's path in the repository. The hub's clients were registered again on this day, so
  connections to Convex, Cloudflare, and GitHub on samebase.com need a reconnect. An app made from
  [samebase/base](https://github.com/samebase/base) has no sign-in until `alchemy.run.ts` lists its
  address: ask your agent to apply the starter changelog, or follow its v2326 entry.
- **v2318: Apps made from samebase/base sign in at the public hub.** Apps now sign in at
  `id.samebase.com`, deployed from the template
  [samebase/identity-hub](https://github.com/samebase/identity-hub). `auth.samebase.com` is
  samebase.com's own hub, and its `google-apps` and `github-apps` are gone, so an app made before
  today has no sign-in until `alchemy.run.ts` names the new hub. Users keep their accounts. Ask your
  agent to apply the starter changelog, or follow its v2318 entry. New apps have it from the start.

## 2026-11-08

- **v2310: Apps made from samebase/base need one update.** The identity hub now takes a deploy's
  GitHub token only when the token names the hub, which `@samebase/alchemy-convex` 0.34.0 and later
  do. On an older version, sign-in keeps working, but a new preview gets no sign-in. Version 0.35.0
  also moves the deploy state store of the Convex team to a new version, so move every app of a team
  on the same day. Ask your agent to apply the starter changelog, or follow its v2310 entry. New
  apps have it from the start.

## 2026-11-07

- **v2301: Apps made from samebase/base sign in through Samebase's public clients.** The identity
  hub's `google` and `github` connectors are now for samebase.com only. Every app signs in through
  `google-apps` and `github-apps`, which Google and GitHub show as "Samebase". An app made from
  [samebase/base](https://github.com/samebase/base) before today has no sign-in until
  `alchemy.run.ts` names them. Ask your agent to apply the starter changelog, or follow its v2301
  entry. New apps have it from the start.
- **v2297: Apps made from samebase/base need one update for sign-in.** The identity hub now asks
  each app which sign-in providers it uses, and it shows a page that names the app before Google or
  GitHub. An app made from [samebase/base](https://github.com/samebase/base) before today needs
  `@samebase/alchemy-convex` 0.33.0 and `connectors` in `alchemy.run.ts`, and its sign-in fails
  until it deploys them. Ask your agent to apply the starter changelog, or follow its v2297 entry.
  New apps have it from the start.

## 2026-11-06

- **v2286: See and delete your apps' sign-in clients.** Sign-in clients, in an organization's menu,
  lists the identity hub's clients of the organization's repositories: one per deployment, with its
  stage, return address, and last sign-in. A member who can create apps can delete one; that
  deployment gets a new client at its next deploy.
- **v2278: Connect GitHub or Cloudflare once more if Samebase asks.** samebase.com now gets its
  sign-in from the identity hub the same way every app does. A GitHub authorization or a Cloudflare
  connection made through the hub before this stops working once: when Samebase asks, connect it
  again. Convex connections and your account stay as they are.
- **v2277: A person's sign-in id is their Google id.** The identity hub gives each app the same id
  for a person, `google:` and Google's own id for the account, in place of a different id in each
  app. The id now stays the same if your app moves to another hub. Each person who signs in to your
  app once more gets the new id once: an app made from
  [samebase/base](https://github.com/samebase/base) makes them a new account then. No outside app
  had sign-ins yet, so no action is needed.
- **v2275: Google sign-in on your laptop, and one secret.** In an app made from
  [samebase/base](https://github.com/samebase/base), `pnpm run hub --stage dev-<your name>` gives
  your development deployment Sign in with Google, after one deploy to main. The repository needs
  only the secret `CONVEX_ACCESS_TOKEN`: the variable `CONVEX_TEAM_ID` is no longer used. To get
  both in an older app, ask your agent to apply the v2275 entry of the starter changelog.

## 2026-11-04

- **v2261: Google sign-in without a Samebase account.** An app made from
  [samebase/base](https://github.com/samebase/base) gets Sign in with Google from the identity hub
  directly, so it needs no Samebase account, and leaving Samebase no longer stops it. An app on
  `@samebase/alchemy-convex` before 0.24.0 keeps its Google sign-in, but a new deployment, such as a
  new pull request preview, gets only guest sign-in until you update the package to 0.24.0. Ask your
  agent to apply the v2261 entry of the starter changelog.
- **v2253: Google sign-in checks your site.** A deploy gets its Google sign-in client only when the
  site serves `/samebase-verification.json` with the repository's GitHub ID, so the client can be on
  any host and callback path. New apps write the file on every deploy. In an app made before this,
  production keeps Google sign-in, but a new preview has only guest sign-in until you apply the
  v2253 entry of the starter changelog. Ask your agent to do it.

## 2026-11-03

- **v2251: Free during the beta.** Samebase no longer offers Pro to new organizations. A personal
  account connects up to 12 repositories and an organization up to 6, as on Free before. Existing
  Pro subscriptions keep their limits; manage or cancel them from your organization's settings.
- **v2246: The docs list is on the page from the start.** The landing and docs pages have their
  sidebar in the first HTML, so it no longer appears after a delay. On a phone, a saved sidebar
  opens without a flash of the main pane, and a swipe is never pulled back while your finger or its
  momentum moves the panes. The `?left` and `?right` URL flags of the landing and docs pages are
  gone: the pane you last used opens.
- **v2245: Cleaner branch and pull request rows.** On a repository page, the main branch and each
  pull request use the same layout: branch and time on top, checks at the right, then the commit or
  pull request title. Tap a title to open it on GitHub. Tap a pull request's diff size, such as
  `+96 −102 3 files`, to open its changed files in Samebase, and the arrow to show its previews. A
  row names the base branch only when it is not the default branch.

## 2026-11-02

- **v2243: Faster repository switching and steady panes.** A repository opens at once and its stacks
  load in place. On a phone, the pane you swiped to stays in place while the page starts, when a
  page loads, and when you go back.
- **v2242: Simpler repository header.** A repository now has one page. Disconnect sits in its header
  and opens the same Remove from Samebase dialog, so the Overview and Settings tabs are gone. The
  repository name is an underlined GitHub link. On a phone, swipe to open the sidebar.
- **v2241: GitHub authorization through the identity hub.** GitHub user authorization now uses the
  same flow as Convex and Cloudflare. Samebase asks you to authorize GitHub once more. Your
  organizations and repositories do not change.
- **v2240: No onboarding video in the sidebar.** The right sidebar no longer shows the onboarding
  video. It covered the first-time Cloudflare setup that New App no longer needs.
- **v2237: Destroy your stack before you delete the repository.** Samebase no longer deletes a
  GitHub repository while your Alchemy state store holds its stack. Run Destroy app first. Remove
  from Samebase still works with a stack.
- **v2236: Shorter repository settings.** Settings now shows only Remove from Samebase. The dialog
  no longer names Workers or Convex projects: your deployed app stays in your cloud accounts.
- **v2234: Provider connections in previews.** Convex and Cloudflare authorization now returns
  through the identity hub, so a new preview does not need its URL registered with either provider.
  A Cloudflare OAuth connection made before this version must reconnect once from your
  organization's Providers page.
- **v2228: One app starter.** The Alchemy starter is now
  [samebase/base](https://github.com/samebase/base). New App uses the same starter. Existing apps
  need no change.
- **v2226: New landing video.** The home page now plays the logo film. The old demo showed the setup
  that Alchemy replaced.
- **v2225: Alchemy replaces the old setup.** New App uses GitHub Actions. Connections and the old
  status and repair tools are gone. Existing apps keep running and Workers Builds keeps deploying.
  [Move to Alchemy](/docs/the-big-migration) to monitor those apps in Samebase. Removing an app
  keeps its Worker and Convex project in your accounts. Delete them there if needed.

## 2026-11-01

- **v2224: Docs folder in the left nav.** The nav follows the URLs now: pages under `/docs` sit in a
  Docs folder, which you can collapse.
- **v2223: The big migration.** [The big migration](/docs/the-big-migration) explains how Samebase
  works with Alchemy and how to move a Worker or Convex app. Your app keeps running if you don't
  move it.
- **v2218: Clearer Destroy app form.** The form now says what it deletes and that your GitHub
  repository stays. To confirm, you type `delete stack and production data of <owner>/<repository>`.
  Apps created before this keep the old form.
- **v2217: Clearer new app setup.** While a new app is being set up, the overview waits for the
  first commit before it reads the default branch. It no longer says the branch has no commit.
- **v2216: Sign-in on the home page.** The Alchemy starter shows Google and guest sign-in on its
  home page, and the separate `/signin` page is gone.
- **v2215: Delete account.** The Alchemy starter's Account page lets people delete their account and
  their to-dos.
- **v2214: Google sign-in for new apps.** Apps set up by GitHub Actions get Sign in with Google
  through `auth.samebase.com`. You don't need a Google project, and no Google key goes in your
  repository.
- **v2210: Convex-only new apps.** New App can set up an app with only GitHub and Convex. The app
  deploys from its own GitHub Actions with Alchemy, and Convex hosts the site.
