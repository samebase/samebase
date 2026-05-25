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

function isLegalPublicPath(pathname: string) {
  return pathname === "/privacy" || pathname === "/terms";
}

function isLogoPublicPath(pathname: string) {
  return pathname === "/logo" || pathname.startsWith("/logo/");
}

function shouldUsePublicLayoutShell(pathname: string) {
  if (isLegalPublicPath(pathname) || isLogoPublicPath(pathname)) {
    return true;
  }

  return pathname === "/" || pathname === "/localStorage";
}

function PublicLayoutRoute() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const shouldUseShell = shouldUsePublicLayoutShell(pathname);
  const chromeStore = useMemo(createPublicLayoutRouteChromeStore, []);
  const routeChrome = usePublicLayoutRouteChromeSnapshot(chromeStore);

  if (!shouldUseShell) {
    return <Outlet />;
  }

  const left =
    routeChrome.left === undefined
      ? undefined
      : {
          ...routeChrome.left,
          content: <PublicLayoutRouteLeftContent store={chromeStore} />,
        };
  const main = {
    ...routeChrome.main,
    content: <Outlet />,
  };

  return (
    <PublicLayoutRouteChromeProvider store={chromeStore}>
      <Layout>
        <PublicLayoutShell
          dataTestId={routeChrome.dataTestId}
          defaultLeftOpen={routeChrome.defaultLeftOpen}
          defaultMobilePane={routeChrome.defaultMobilePane}
          left={left}
          leftToggleVisibility={routeChrome.leftToggleVisibility}
          main={main}
          rightToggleVisibility={routeChrome.rightToggleVisibility}
          showRightSidebar={routeChrome.showRightSidebar}
        />
      </Layout>
    </PublicLayoutRouteChromeProvider>
  );
}

export const Route = createFileRoute("/_public")({
  staticData: { permission: "public" },
  component: PublicLayoutRoute,
});
