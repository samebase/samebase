import { rootRouteId, useRouteContext } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import type { ReactNode } from "react";

/**
Renders unless `SignedIn` does: for a visitor without a session, and on a prerendered page, whose
render knows no session (`token` is `undefined`), until the browser's provider settles. The
prerender shows the signed-out page, so a signed-in visitor sees the sign-in until the session
settles.
*/
export function NotSignedIn({ children }: { children: ReactNode }) {
  const renderedWithSession = useRouteContext({
    from: rootRouteId,
    select: (context) => typeof context.token === "string",
  });
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (isLoading ? renderedWithSession : isAuthenticated) ? null : children;
}
