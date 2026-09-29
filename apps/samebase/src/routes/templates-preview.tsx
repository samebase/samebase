import { createFileRoute } from "@tanstack/react-router";
import { TemplatesProposalPage } from "@/components/templates-proposal/TemplatesProposalPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/templates-preview")({
  component: TemplatesProposalPage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/templates-preview"],
  head: () => ({
    meta: [
      { title: "Templates proposal | Samebase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
