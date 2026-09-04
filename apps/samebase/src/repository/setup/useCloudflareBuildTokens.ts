import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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
  lastUsedUuid,
  tokens,
}: {
  error: boolean;
  initialUuid: string | null;
  isFetching: boolean;
  lastUsedUuid: string | null;
  tokens: readonly { uuid: string }[] | null;
}) {
  const [requestedUuid, setRequestedUuid] = useState<string | null>(initialUuid);

  let selectedUuid = "";
  if (requestedUuid) {
    if (tokens?.some((token) => token.uuid === requestedUuid)) {
      selectedUuid = requestedUuid;
    }
  } else if (!isFetching && !error) {
    selectedUuid =
      tokens?.find((token) => token.uuid === lastUsedUuid)?.uuid ?? tokens?.[0]?.uuid ?? "";
  }

  return {
    canWrite: Boolean(selectedUuid && !isFetching && !error),
    selectedUuid,
    selectionUnavailable: Boolean(requestedUuid && tokens !== null && !selectedUuid),
    setRequestedUuid,
  };
}
