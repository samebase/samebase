import { SAMEBASE_PUBLIC_LINKS } from "@/lib/publicLinks";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute, redirect } from "@tanstack/react-router";

const pathname = "/x.com";

export const Route = createFileRoute("/x.com")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  beforeLoad: () => {
    throw redirect({ href: SAMEBASE_PUBLIC_LINKS.x.destination });
  },
});
