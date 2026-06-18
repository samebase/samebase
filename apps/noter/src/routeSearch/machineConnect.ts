import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchPresenceParam,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

const RouteSearchSchema_machineConnect = defineRouteSearchParams({
  openedByCli: routeSearchPresenceParam({
    access: "access_machines",
    suggestion: "route",
  }),
  requestId: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_machines",
    sampleValue: "sample-request",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type MachineConnectRouteSearch = InferRouteSearch<typeof RouteSearchSchema_machineConnect>;

const machineConnectRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_machineConnect,
);

const MACHINE_CONNECT_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  machineConnectRouteSearchParamMetadata,
);

export const MACHINE_CONNECT_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  machineConnectRouteSearchParamMetadata,
);

export function validateMachineConnectRouteSearch(
  search: Record<string, unknown>,
): MachineConnectRouteSearch {
  return RouteSearchSchema_machineConnect.parse(
    normalizeRouteSearchPresenceFlags(search, MACHINE_CONNECT_PRESENCE_SEARCH_KEYS),
  );
}
