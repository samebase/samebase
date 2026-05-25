import { Layout, PublicLayoutShell } from "@/Layout";
import { createFileRoute, Outlet, useLocation, useMatches } from "@tanstack/react-router";
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
import { isPublicLayoutShellPathname } from "@/lib/publicLayoutPaths";

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

function PublicLayoutRoute() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const initialRouteChrome = useMatches({
    select: (matches) => {
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const routeChrome = matches[index]?.staticData.publicLayoutRouteChrome;
        if (routeChrome !== undefined) {
          return routeChrome;
        }
      }

      return undefined;
    },
  });
  const shouldUseShell = isPublicLayoutShellPathname(pathname);
  const chromeStore = useMemo(createPublicLayoutRouteChromeStore, []);
  const registeredRouteChrome = usePublicLayoutRouteChromeSnapshot(chromeStore);
  const routeChrome = hasRegisteredRouteChrome(registeredRouteChrome)
    ? registeredRouteChrome
    : (initialRouteChrome ?? {});

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
