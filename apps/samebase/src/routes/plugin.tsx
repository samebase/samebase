import { SAMEBASE_PUBLIC_LINKS } from "@/lib/publicLinks";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute, redirect } from "@tanstack/react-router";

const pathname = "/plugin";

export const Route = createFileRoute("/plugin")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  beforeLoad: () => {
    throw redirect({ href: SAMEBASE_PUBLIC_LINKS.plugin.destination });
  },
});
