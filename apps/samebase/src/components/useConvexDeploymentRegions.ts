import { useQuery as useConvexQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ConvexDeploymentRegion } from "../../shared/convexDeploymentRegions";

export function useConvexDeploymentRegion({
  enabled,
  organizationId,
  selectionKey,
}: {
  enabled: boolean;
  organizationId: Id<"organizations">;
  selectionKey: string;
}) {
  const defaultRegion = useConvexQuery(
    api.convexDeploymentRegions.getDefault,
    enabled ? { organizationId } : "skip",
  );
  const [request, setRequest] = useState<{
    selectionKey: string;
    region: ConvexDeploymentRegion;
  } | null>(null);

  return {
    selectedRegion:
      request?.selectionKey === selectionKey ? request.region : (defaultRegion ?? null),
    setRequestedRegion: (region: ConvexDeploymentRegion | null) => {
      setRequest(region ? { selectionKey, region } : null);
    },
  };
}
