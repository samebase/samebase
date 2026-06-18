import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

const RouteSearchSchema_machines = defineRouteSearchParams({
  machineId: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_machines",
    sampleValue: "sample-machine",
    suggestion: "route",
    valueType: "freeform",
  }),
  threadId: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_machines",
    sampleValue: "sample-thread",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type MachinesRouteSearch = InferRouteSearch<typeof RouteSearchSchema_machines>;

const machinesRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_machines);

export const MACHINES_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  machinesRouteSearchParamMetadata,
);

export function validateMachinesRouteSearch(search: Record<string, unknown>): MachinesRouteSearch {
  return RouteSearchSchema_machines.parse(search);
}

export function buildMachinesRouteSearch(args?: {
  machineId?: string | null;
  threadId?: string | null;
}): MachinesRouteSearch {
  const machineId = typeof args?.machineId === "string" ? args.machineId.trim() : "";
  const threadId = typeof args?.threadId === "string" ? args.threadId.trim() : "";

  return {
    ...(machineId.length > 0 ? { machineId } : {}),
    ...(threadId.length > 0 ? { threadId } : {}),
  };
}
