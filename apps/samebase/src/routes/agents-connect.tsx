import { createFileRoute } from "@tanstack/react-router";
import { AgentsConnectRoutePage } from "@/agentAccess/AgentsConnectRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { AGENT_BROWSER_HANDOFF_ROUTE } from "../../shared/agentBrowserHandoff";

const pathname = AGENT_BROWSER_HANDOFF_ROUTE;

export const Route = createFileRoute("/agents/connect")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: AgentsConnectRoutePage,
});
