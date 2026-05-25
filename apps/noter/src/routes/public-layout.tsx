import { Layout, PublicLayoutShell } from "@/Layout";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  PublicLayoutRouteChromeProvider,
  PublicLayoutRouteLeftContent,
} from "@/lib/publicLayoutRouteChrome";
import {
  createPublicLayoutRouteChromeStore,
  usePublicLayoutRouteChromeSnapshot,
} from "@/lib/publicLayoutRouteChromeStore";
import { isPublicLayoutShellPathname } from "@/lib/publicLayoutPaths";

function PublicLayoutRoute() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const shouldUseShell = isPublicLayoutShellPathname(pathname);
  const chromeStore = useMemo(createPublicLayoutRouteChromeStore, []);
  const routeChrome = usePublicLayoutRouteChromeSnapshot(chromeStore);

  if (!shouldUseShell) {
    return <Outlet />;
  }

  const left = routeChrome.hasLeft
    ? {
        content: <PublicLayoutRouteLeftContent store={chromeStore} />,
      }
    : undefined;
  const main = {
    content: <Outlet />,
  };

  return (
    <PublicLayoutRouteChromeProvider store={chromeStore}>
      <Layout>
        <PublicLayoutShell left={left} main={main} />
      </Layout>
    </PublicLayoutRouteChromeProvider>
  );
}

export const Route = createFileRoute("/_public")({
  staticData: { permission: "public" },
  component: PublicLayoutRoute,
});
