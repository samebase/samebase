import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useNow } from "@/hooks/useNow";
import { formatStopwatchDuration } from "@/lib/stopwatch";
import { ClockIcon } from "@/lib/radixIcons";

export function VaultProviderDiscoveryLoadingState({ label }: { label: string }) {
  const [startedAt] = useState(Date.now);
  const now = useNow({ intervalMs: 100 });
  const elapsedLabel = formatStopwatchDuration(now - startedAt);

  return (
    <div role="status" className="flex items-center justify-between gap-3 border-y py-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        <span>{label}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <ClockIcon className="h-3.5 w-3.5" />
        <span aria-label={`Elapsed search time ${elapsedLabel}`}>{elapsedLabel}</span>
      </span>
    </div>
  );
}
