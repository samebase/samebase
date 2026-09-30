# APP-001: Create an app with native Worker Previews

## Purpose

Check that app creation sets separate production and preview build credentials. Check that a second
build of one branch keeps its Convex data and login session.

## Preconditions

- Start the current worktree with `pnpm run dev`.
- Use the seeded test organization with GitHub, Convex, and Cloudflare connected.
- Use a current Workers Builds token from the New App form.

## Steps

1. Sign in through the local password shortcut. Open the test organization's **New app** page.
2. Create one app named `tmp-<worktree-id>-native-previews`.
3. Wait for provider setup and the production build to finish.
4. Read the Worker's Builds settings. Check that native previews are enabled, production uses
   `pnpm run deploy`, and Previews Base uses `pnpm run deploy:preview`.
5. Check variable names without displaying secret values. Production has `CONVEX_DEPLOY_KEY` and
   `SAMEBASE_CONVEX_PROJECT`. Previews Base has only `CONVEX_DEPLOY_KEY`.
6. Create a branch and PR with a small README change. Wait for its Cloudflare preview build.
7. Open the preview URL with `?prod-ui`. Create a test account and add one todo.
8. Push a second README change to the same branch. Wait for the second preview build.
9. Reload the preview. Check that the test account is still signed in and the todo is still present.
10. Rotate the app's Convex deploy keys through Samebase. Build the same preview branch again.

## Expected Results

1. The app creation flow needs no manual Cloudflare configuration.
2. The production and preview builds both pass.
3. Each branch has its own Convex preview deployment. The second build uses the same deployment.
4. Data and the login session survive the second build.
5. Key rotation updates existing preview build credentials. The next preview build passes.

## Optional Evidence

- Save the GitHub PR URL and the production and preview build IDs.
- Save a preview screenshot before and after the second build.
- Never save deploy keys or JWT private keys in evidence.

## Cleanup

- Close the test PR.
- Remove the matching temporary app through the Samebase dashboard removal flow.
- Check that its GitHub repository, Convex project, and Worker are removed.
