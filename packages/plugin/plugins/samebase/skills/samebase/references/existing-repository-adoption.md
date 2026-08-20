# Adopt an existing repository

Connect an existing repository to Samebase before you set up a provider. Samebase creates the app
record and syncs the repository tree. Samebase does not attach or change Convex or Cloudflare
resources. You can then change the source and set up providers as separate tasks.

## Recommended sequence

1. Read the Samebase app inventory. If the repository is not in the inventory, connect it.
2. Read the repository instructions and deployment commands from its current default branch.
3. Prepare and validate the required source changes in a pull request.
4. Before provider setup, name the provider account and each resource to attach or create. Also
   state which production builds the action can start.
5. After the operator approves those provider writes, attach or create the resources. Then verify
   their live state.
6. Wait until the reviewed source reaches the default branch. Then verify production. Separately,
   verify that the pull request preview is reachable.

This sequence prevents an automatic provider build from using source that is not ready. Use this
sequence if the app serves traffic or if a failed production build would disrupt users.

## Set up the provider earlier

For a small or experimental app, the operator can set up the provider before the source changes
reach the default branch. Connect the repository first. Before each provider write, explain what
will change and get the operator's approval.

When Samebase creates a Worker, it configures the production and preview GitHub Builds triggers.
Samebase also requests the first production build. The build can fail if the default branch does not
yet contain the required deployment contract. Use the failure and provider logs to diagnose the
build while you prepare the source pull request. Do not report a failed build as a deployment.

Keep the existing live route active or retain a known-good Worker version until you verify the new
production path.

## Preview behavior before the first deployment

During one assets-only 3D browser game adoption, a new Worker had a preview version before its first
active deployment. Cloudflare returned error 1042 for the version URL and branch alias. After the
operator approved the default-branch build, the build created the first active deployment. The
previous preview URLs and a new pull request preview then became reachable. The new preview did not
replace the production version.

This happened in one project. It is not a Cloudflare requirement. Use these steps if a Worker has a
preview version but no active deployment, and Cloudflare returns error 1042 for its preview URLs:

1. Keep preview verification blocked while the preview URL is not reachable.
2. Do not start a production deployment only to make the preview URL reachable without the
   operator's explicit approval.
3. After the operator approves the first production deployment and the deployment completes, check
   the previous preview URLs. Then create a new preview.
4. Verify that the new preview is reachable. Also verify that the active production version did not
   change.
