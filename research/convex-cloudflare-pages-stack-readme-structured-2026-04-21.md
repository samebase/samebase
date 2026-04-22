# Convex Cloudflare Pages Stack onboarding draft

Tab order for the tutorial should stay fixed across the whole flow:

1. GitHub
2. Convex
3. Cloudflare

The videos can be stitched from one canonical recording, then cut at stable
moments when the screen is settled and the mouse is at rest.

Timing guidance:

- After a page visibly finishes loading or a new destination is reached, keep
  that page on screen for about 1 second before switching tabs or continuing.
- For the initial Cloudflare dashboard landing in step 1, hold for about 2
  seconds before switching away so the viewer can register where they arrived.
- Always start the GitHub source step from `https://github.com/noter-md/app`.
- The generated user repo name is fixed to `my-first-app`. Never create a repo
  named `app`, because that collides conceptually with the source template and
  hides cleanup failures.
- Every recorder-created GitHub repository must be `Private`. Do not trust the
  default visibility shown by the page.
- Do not apply that long pause to small control interactions like opening a
  dropdown, choosing an owner, or clicking a suggestion chip. Those should use
  only a short settle delay.
- Do not move on at the exact instant a page becomes ready; the viewer needs a
  brief beat to register where they landed.
- If Cloudflare shows the GitHub OAuth permission screen, visibly click
  `Authorize cloudflare` before continuing. Do not abandon that page or treat
  it as an invisible background redirect.
- Every external resource we create during the tutorial needs a matching delete
  path in the operator plan so reruns do not leak repos, projects, or apps.

## Authentication strategy

The decisive simplifier for the initial tutorial is that GitHub should be the
central identity.

Why this is the clearest path:

- GitHub is already required to create the repo from the template.
- That source template is `noter-md/app`, not `noter-md/template`.
- Convex needs GitHub access during the setup flow.
- Cloudflare Pages also needs GitHub access to import and deploy the repo.
- Because repo access flows through GitHub anyway, GitHub stops being just one
  login option and becomes the natural backbone of the tutorial.

Practical recording guidance:

- Start from a dedicated Chrome profile where GitHub is already authenticated.
- Show Convex and Cloudflare signing in with GitHub where that helps orient the
  user.
- Do not spend tutorial time on the noisy GitHub email-code flow.
- Do not switch the main onboarding story to Google just because some products
  also support Google login.

Scope guidance:

- The initial deployment tutorial should stay GitHub-centered.
- Codex should not be part of the first deployment tutorial.
- If we later create a Codex customization tutorial, that can introduce Google
  as the Codex identity without polluting the initial stack setup flow.

## 1. Open the 3 tabs and set the scene

Mini-steps:

- Open GitHub, Convex, and Cloudflare in that order.
- Make sure the viewer can see that the tutorial uses the same 3 tabs
  throughout.
- Sign in with GitHub where needed so the session feels realistic.
- End this step with all 3 tabs ready for the rest of the flow.

## 2. Create your GitHub repo

Mini-steps:

- Go to `noter-md/app`.
- Find and click the green `Use this template` button.
- Create a new private repository named `my-first-app` in the correct account
  or org.
- Wait until the new repo is created and visible.

## 3. Create your Convex project

Mini-steps:

- Open the Convex tab.
- Click `Create Project`.
- Give the project the same name as the GitHub repo.
- Wait until the project is created and ready.

## 4. Start the Cloudflare deploy

Mini-steps:

- Open the Cloudflare tab.
- Go to `Workers & Pages`.
- Create a new Pages application from the GitHub repo.
- Select the repo created in step 2.
- Set the build command to `pnpm build:cloudflare`.
- Set the build output directory to `dist`.
- Open the environment variables section.
- Add the `CONVEX_DEPLOY_KEY` variable name, but leave the value empty for now.

## 5. Create the Convex deploy key and finish the deploy

Mini-steps:

- Switch to the Convex tab.
- Move from `Development (Cloud)` to `Production`.
- Open project settings.
- Create a deploy key named something like `for_cloudflare_pages`.
- Copy the deploy key.
- Immediately switch back to the Cloudflare tab.
- Paste the deploy key into `CONVEX_DEPLOY_KEY`.
- Click `Save & Deploy`.
- Wait for the deployment to finish and open the final app URL.

## 6. Delete the created resources

Mini-steps:

- Delete the Cloudflare Pages app first so the deploy target is removed before
  its backing repo and backend disappear.
- In Cloudflare, open the Pages project, go to `Settings`, scroll to the delete
  section, type the project slug, and confirm deletion.
- Delete the Convex project second.
- In Convex, open `Project Settings`, use `Delete Project`, check the
  acknowledgement box, type the full deletion phrase, and confirm.
- Delete the GitHub repo last.
- In GitHub, open repo `Settings`, use the staged danger-zone delete flow, type
  the full `owner/repo` name, and confirm deletion.
- Treat this cleanup path as part of the real product story, not just operator
  hygiene.
- Keep the cleanup flow reusable for automated end-to-end reruns.
