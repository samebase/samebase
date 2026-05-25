import { Layout, PublicLayoutShell } from "@/Layout";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  PublicLayoutRouteChromeProvider,
  PublicLayoutRouteLeftContent,
} from "@/lib/publicLayoutRouteChrome";
import {
  createPublicLayoutRouteChromeStore,
  type PublicLayoutRouteChromeSnapshot,
  usePublicLayoutRouteChromeSnapshot,
} from "@/lib/publicLayoutRouteChromeStore";
import {
  isPublicLayoutShellPathname,
  readPublicLayoutShellPathname,
} from "@/lib/publicLayoutPaths";

function hasRegisteredRouteChrome(routeChrome: PublicLayoutRouteChromeSnapshot): boolean {
  return (
    routeChrome.dataTestId !== undefined ||
    routeChrome.defaultLeftOpen !== undefined ||
    routeChrome.defaultMobilePane !== undefined ||
    routeChrome.left !== undefined ||
    routeChrome.leftToggleVisibility !== undefined ||
    routeChrome.main !== undefined ||
    routeChrome.rightToggleVisibility !== undefined ||
    routeChrome.showRightSidebar !== undefined
  );
}

function readInitialPublicLayoutRouteChrome(pathname: string): PublicLayoutRouteChromeSnapshot {
  const normalizedPathname = readPublicLayoutShellPathname(pathname);
  if (normalizedPathname === "/localStorage") {
    return {
      dataTestId: "local-storage-workspace",
      defaultLeftOpen: true,
      left: {},
      leftToggleVisibility: "desktop",
    };
  }

  if (normalizedPathname === "/logo" || normalizedPathname.startsWith("/logo/")) {
    return {
      defaultLeftOpen: true,
      defaultMobilePane: "left",
      left: {},
      leftToggleVisibility: "desktop",
      main: {
        headerTestId: "logo-preview-main-header",
      },
    };
  }

  return {};
}

function PublicLayoutRoute() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const shouldUseShell = isPublicLayoutShellPathname(pathname);
  const chromeStore = useMemo(createPublicLayoutRouteChromeStore, []);
  const registeredRouteChrome = usePublicLayoutRouteChromeSnapshot(chromeStore);
  const routeChrome = hasRegisteredRouteChrome(registeredRouteChrome)
    ? registeredRouteChrome
    : readInitialPublicLayoutRouteChrome(pathname);

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
