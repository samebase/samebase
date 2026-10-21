import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import {
  AUTHENTICATED_ACCOUNT_DELETED,
  AUTHENTICATED_ACCOUNT_REFERENCE_INVALID,
} from "../../shared/authenticatedAccountAvailability";

/**
The queries of the root loader: the signed-in viewer for the account chrome and the route gates,
the saved workspace sidebar state for the pane geometry, the right sidebar's organizations, consent
prompts, and onboarding condition, and, for a visitor without a session, the sign-in methods of the
deployment.
*/
export const rootQueries = {
  deploymentAuthPolicy: convexQuery(api.deploymentProfile.getPublicDeploymentAuthPolicy, {}),
  organizations: convexQuery(api.organizations.listForViewer, {}),
  productUpdateEmailConsent: convexQuery(api.users.getProductUpdateEmailConsent, {}),
  repositories: convexQuery(api.repository.list, {}),
  sessionRecordingConsent: convexQuery(api.users.getSessionRecordingConsent, {}),
  viewer: convexQuery(api.users.viewer, {}),
  viewerAccess: convexQuery(api.users.currentViewerAccess, {}),
  workspaceSidebarState: convexQuery(api.workspaceSidebarState.getWorkspaceSidebarState, {
    workspaceKey: "app",
  }),
};

/**
A loader's query, or null when the session's account was deleted or its user record is gone. Every
query of that session then throws until its token expires, and AccountDeletionBrowserBoundary
recovers: it signs the browser out and clears its data once its own query sees the error. A loader
that threw would answer the render with a 500 and the boundary would never render.
*/
export async function unlessAccountGone<Result>(query: Promise<Result>) {
  try {
    return await query;
  } catch (error) {
    if (
      error instanceof ConvexError &&
      (error.data === AUTHENTICATED_ACCOUNT_DELETED ||
        error.data === AUTHENTICATED_ACCOUNT_REFERENCE_INVALID)
    ) {
      return null;
    }
    throw error;
  }
}

/**
The root loader. The server render queries as the user, so the account chrome, the pane widths, the
right sidebar, and the route access checks have their data in the first HTML; a visitor without a
session gets the sign-in methods instead. The right sidebar's queries need the access that its
signed-in content needs, so they wait for the viewer's access. The browser's navigations have no
token here and read the cache, which the subscriptions keep live.
*/
export async function loadRoot({
  queryClient,
  token,
}: {
  queryClient: QueryClient;
  token: string | null | undefined;
}) {
  if (token) {
    const [, viewerAccess] = await Promise.all([
      unlessAccountGone(queryClient.query(rootQueries.viewer)),
      unlessAccountGone(queryClient.query(rootQueries.viewerAccess)),
      unlessAccountGone(queryClient.query(rootQueries.workspaceSidebarState)),
    ]);
    if (viewerAccess === null) {
      // The render would send the failed queries to the browser as plain errors, without the
      // ConvexError data that AccountDeletionBrowserBoundary reads, so the browser asks again.
      queryClient.removeQueries({ queryKey: rootQueries.viewer.queryKey });
      queryClient.removeQueries({ queryKey: rootQueries.viewerAccess.queryKey });
      queryClient.removeQueries({ queryKey: rootQueries.workspaceSidebarState.queryKey });
      return;
    }

    const { accessKeys } = viewerAccess;
    await Promise.all([
      accessKeys.includes("access_dashboard") ? queryClient.query(rootQueries.organizations) : null,
      accessKeys.includes("access_provider_connections")
        ? Promise.all([
            queryClient.query(rootQueries.repositories),
            queryClient.query(rootQueries.productUpdateEmailConsent),
            queryClient.query(rootQueries.sessionRecordingConsent),
          ])
        : null,
    ]);
  } else if (token === null) {
    // Not in the build's prerender, where `token` is undefined: a new deployment's first build runs
    // before its first push, so the deployment has no functions to answer the query yet.
    await queryClient.query(rootQueries.deploymentAuthPolicy);
  }
}
