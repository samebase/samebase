import { api } from "../../convex/_generated/api";
import { usePostHog } from "@posthog/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { isPostHogEnabled } from "./posthog";

function buildViewerSignature(viewer: {
  _id: string;
  email?: string;
  name?: string;
  githubUsername?: string;
  hasGithubConnection: boolean;
  hasConvexConnection: boolean;
  hasCloudflareConnection: boolean;
}) {
  return JSON.stringify({
    id: viewer._id,
    email: viewer.email ?? null,
    name: viewer.name ?? null,
    githubUsername: viewer.githubUsername ?? null,
    hasGithubConnection: viewer.hasGithubConnection,
    hasConvexConnection: viewer.hasConvexConnection,
    hasCloudflareConnection: viewer.hasCloudflareConnection,
  });
}

export function useSyncPostHogIdentity() {
  const posthog = usePostHog();
  const viewer = useQuery(api.users.viewer);
  const { isAuthenticated } = useConvexAuth();
  const lastViewerSignatureRef = useRef<string | null>(null);
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (!isPostHogEnabled) {
      return;
    }

    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;
      return;
    }

    if (!wasAuthenticatedRef.current) {
      return;
    }

    // Reset only on auth teardown so a signed-out browser gets a fresh
    // anonymous distinct ID without churning it on every public-route render.
    posthog.reset();
    wasAuthenticatedRef.current = false;
    lastViewerSignatureRef.current = null;
  }, [isAuthenticated, posthog]);

  useEffect(() => {
    if (!isPostHogEnabled || !isAuthenticated || viewer === undefined) {
      return;
    }

    if (viewer === null) {
      return;
    }

    const viewerSignature = buildViewerSignature(viewer);
    if (lastViewerSignatureRef.current === viewerSignature) {
      return;
    }

    // Keep the analytics person bound to the same auth identity the product
    // uses so frontend events can be joined to server-side records later.
    posthog.identify(viewer._id, {
      email: viewer.email,
      name: viewer.name,
      github_username: viewer.githubUsername,
      has_github_connection: viewer.hasGithubConnection,
      has_convex_connection: viewer.hasConvexConnection,
      has_cloudflare_connection: viewer.hasCloudflareConnection,
    });
    lastViewerSignatureRef.current = viewerSignature;
  }, [isAuthenticated, posthog, viewer]);
}
