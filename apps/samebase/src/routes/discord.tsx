import { SAMEBASE_PUBLIC_LINKS } from "@/publicSite/publicLinks";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute, redirect } from "@tanstack/react-router";

const pathname = "/discord";

export const Route = createFileRoute("/discord")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  beforeLoad: () => {
    throw redirect({ href: SAMEBASE_PUBLIC_LINKS.discord.destination });
  },
});
