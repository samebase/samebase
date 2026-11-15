import { convexAuthProvider } from "@convex-dev/auth/server";
import type { AuthConfig } from "convex/server";

// The auth component signs access tokens with the deployment's key, for the issuer
// `${CONVEX_CLOUD_URL}/components/auth` and the audience "convex-auth".
export default {
  providers: [convexAuthProvider()],
} satisfies AuthConfig;
