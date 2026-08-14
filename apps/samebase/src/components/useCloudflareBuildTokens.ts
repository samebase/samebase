import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useCloudflareBuildTokens({
  enabled,
  organizationId,
}: {
  enabled: boolean;
  organizationId: Id<"organizations">;
}) {
  const listCloudflareBuildTokens = useAction(api.cloudflareBuildTokens.list);

  return useTanStackQuery({
    enabled,
    queryFn: async () => await listCloudflareBuildTokens({ organizationId }),
    queryKey: ["cloudflare-build-tokens", organizationId],
    retry: false,
  });
}

export function useCloudflareBuildTokenSelection({
  error,
  initialUuid,
  isFetching,
  tokens,
}: {
  error: boolean;
  initialUuid: string | null;
  isFetching: boolean;
  tokens: readonly { uuid: string }[] | null;
}) {
  const [requestedUuid, setRequestedUuid] = useState<string | null>(initialUuid);

  useEffect(() => {
    if (requestedUuid !== null || tokens === null || isFetching || error) {
      return;
    }
    setRequestedUuid(tokens.length === 1 ? tokens[0].uuid : "");
  }, [error, isFetching, requestedUuid, tokens]);

  const selectedUuid =
    requestedUuid && tokens?.some((token) => token.uuid === requestedUuid) ? requestedUuid : "";

  return {
    canWrite: Boolean(selectedUuid && !isFetching && !error),
    requestedUuid: requestedUuid ?? "",
    selectedUuid,
    setRequestedUuid,
  };
}
