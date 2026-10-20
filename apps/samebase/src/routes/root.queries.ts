import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";

/**
The queries of the root loader: the signed-in viewer for the account chrome and the route gates,
and, for a visitor without a session, the sign-in methods of the deployment.
*/
export const rootQueries = {
  deploymentAuthPolicy: convexQuery(api.deploymentProfile.getPublicDeploymentAuthPolicy, {}),
  viewer: convexQuery(api.users.viewer, {}),
  viewerAccess: convexQuery(api.users.currentViewerAccess, {}),
};
