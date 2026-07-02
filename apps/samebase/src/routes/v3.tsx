import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/v3/$";

const PaneTrailLabRoutePage = lazy(async () => {
  const module = await import("@/components/pane-trail-lab/PaneTrailLab");
  return { default: module.PaneTrailLabRoutePage };
});

function PaneTrailLabSplat() {
  return (
    <AuthenticatedAppRoutePage>
      <PaneTrailLabRoutePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/v3/$")({
  staticData: { ...ROUTE_ACCESS_METADATA_BY_PATH[pathname] },
  component: PaneTrailLabSplat,
});
