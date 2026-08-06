import { AuthenticatedUserRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { McpClientsSettingsPage } from "@/components/McpClientsSettingsPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/mcp")({
  component: SettingsMcpRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/settings/mcp"],
});

function SettingsMcpRoutePage() {
  return (
    <AuthenticatedUserRoutePage>
      <McpClientsSettingsPage />
    </AuthenticatedUserRoutePage>
  );
}
