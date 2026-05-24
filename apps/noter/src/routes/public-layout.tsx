import { Layout, PublicLayoutShell } from "@/Layout";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

function isLegalPublicPath(pathname: string) {
  return pathname === "/privacy" || pathname === "/terms";
}

function shouldUsePublicLayoutShell(pathname: string) {
  if (isLegalPublicPath(pathname)) {
    return true;
  }

  return pathname === "/";
}

function PublicLayoutRoute() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const shouldUseShell = shouldUsePublicLayoutShell(pathname);

  if (!shouldUseShell) {
    return <Outlet />;
  }

  return (
    <Layout>
      <PublicLayoutShell>
        <Outlet />
      </PublicLayoutShell>
    </Layout>
  );
}

export const Route = createFileRoute("/_public")({
  staticData: { permission: "public" },
  component: PublicLayoutRoute,
});
