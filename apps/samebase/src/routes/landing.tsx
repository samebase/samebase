import { createFileRoute, redirect } from "@tanstack/react-router";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/landing";

export const Route = createFileRoute("/landing")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  beforeLoad: () => {
    throw redirect({
      href: "/",
      replace: true,
    });
  },
});
