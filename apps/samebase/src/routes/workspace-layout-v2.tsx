import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePeerPaneRoutePage } from "@/components/WorkspacePeerPaneRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import type { RouteStaticData } from "@/routing/permissions";

const pathname = "/workspace-layout-v2";

const workspaceLayoutV2RouteStaticData = {
  ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  acceptedSearchKeys: ["panes", "pane"],
  searchParamSuggestions: [
    {
      access: "access_public",
      key: "panes",
      numericDefaultValue: 4,
      sampleValue: "4",
      searchParamKind: "value",
      valueSuggestions: ["3", "4", "5"],
      valueType: "numeric-options",
    },
    {
      access: "access_public",
      key: "pane",
      sampleValue: "editor",
      searchParamKind: "value",
      valueSuggestions: ["files", "editor", "preview", "terminal", "notes"],
      valueType: "options",
    },
  ],
} satisfies RouteStaticData;

export const Route = createFileRoute("/workspace-layout-v2")({
  staticData: workspaceLayoutV2RouteStaticData,
  component: WorkspacePeerPaneRoutePage,
});
