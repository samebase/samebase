import { rootRouteId, useRouteContext } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import type { ReactNode } from "react";

/**
Renders while neither `SignedIn` nor `SignedOut` does: on a prerendered page, whose render knows no
session (`token` is `undefined`), until the browser's provider settles. A server render with a
request knows the session from its token, so this renders nothing there.
*/
export function SessionPending({ children }: { children: ReactNode }) {
  const tokenUnknown = useRouteContext({
    from: rootRouteId,
    select: (context) => context.token === undefined,
  });
  const { isLoading } = useConvexAuth();

  return tokenUnknown && isLoading ? children : null;
}
