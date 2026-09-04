import { Loader2 } from "lucide-react";

export function RepositoryProviderDiscoveryLoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-10 items-center gap-2 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      <span>{label}</span>
    </div>
  );
}
