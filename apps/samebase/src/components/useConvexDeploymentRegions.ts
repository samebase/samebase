import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ConvexDeploymentRegion } from "../../shared/convexDeploymentRegions";

export function useConvexDeploymentRegions({
  enabled,
  organizationId,
}: {
  enabled: boolean;
  organizationId: Id<"organizations">;
}) {
  const listDeploymentRegions = useAction(api.convexDeploymentRegions.list);

  return useQuery({
    enabled,
    queryFn: async () => await listDeploymentRegions({ organizationId }),
    queryKey: ["convex-deployment-regions", organizationId],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useConvexDeploymentRegionSelection({
  defaultRegion,
  error,
  isFetching,
  regions,
  selectionKey,
}: {
  defaultRegion: ConvexDeploymentRegion | null;
  error: boolean;
  isFetching: boolean;
  regions: readonly { name: ConvexDeploymentRegion; available: boolean }[] | null;
  selectionKey: string;
}) {
  const [request, setRequest] = useState<{
    selectionKey: string;
    region: ConvexDeploymentRegion | null;
  } | null>(null);
  const requestedRegion = request?.selectionKey === selectionKey ? request.region : null;
  const candidateRegion = requestedRegion ?? defaultRegion;
  const selectedRegion =
    candidateRegion &&
    regions?.some((region) => region.name === candidateRegion && region.available)
      ? candidateRegion
      : null;

  return {
    canWrite: Boolean(selectedRegion && !isFetching && !error),
    selectedRegion,
    selectionUnavailable: Boolean(candidateRegion && regions !== null && !selectedRegion),
    setRequestedRegion: (region: ConvexDeploymentRegion | null) => {
      setRequest({ selectionKey, region });
    },
  };
}
