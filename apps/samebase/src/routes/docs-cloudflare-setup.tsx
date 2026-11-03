import { createFileRoute, redirect } from "@tanstack/react-router";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { DOCS_THE_BIG_MIGRATION_ROUTE } from "@/routeSearch/landingPreview";

const pathname = "/docs/cloudflare-setup";

/** A retired guide to the old Cloudflare setup; outside links still reach it. */
export const Route = createFileRoute("/docs/cloudflare-setup")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  beforeLoad: () => {
    throw redirect({
      href: DOCS_THE_BIG_MIGRATION_ROUTE,
      replace: true,
    });
  },
});
