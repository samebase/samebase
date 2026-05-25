import { Layout, PublicLayoutShell } from "@/Layout";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { PublicLayoutRouteChromeProvider } from "@/lib/publicLayoutRouteChrome";
import {
  createPublicLayoutRouteChromeStore,
  usePublicLayoutRouteLeftContent,
} from "@/lib/publicLayoutRouteChromeStore";
import { isPublicLayoutShellPathname } from "@/lib/publicLayoutPaths";

function PublicLayoutRoute() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const shouldUseShell = isPublicLayoutShellPathname(pathname);
  const chromeStore = useMemo(createPublicLayoutRouteChromeStore, []);
  const leftContent = usePublicLayoutRouteLeftContent(chromeStore);

  if (!shouldUseShell) {
    return <Outlet />;
  }

  const left = leftContent === null ? undefined : { content: leftContent };
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
