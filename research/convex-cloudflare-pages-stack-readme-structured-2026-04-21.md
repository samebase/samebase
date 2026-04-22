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
- Do not apply that long pause to small control interactions like opening a
  dropdown, choosing an owner, or clicking a suggestion chip. Those should use
  only a short settle delay.
- Do not move on at the exact instant a page becomes ready; the viewer needs a
  brief beat to register where they landed.

## Authentication strategy

The decisive simplifier for the initial tutorial is that GitHub should be the
central identity.

Why this is the clearest path:

- GitHub is already required to create the repo from the template.
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

- Go to `noter-md/convex-cloudflare-pages-stack`.
- Find and click the green `Use this template` button.
- Create a new repository in the correct account or org.
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
