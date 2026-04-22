import { ClockIcon } from "@/lib/radixIcons";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChangedFilesLoadingState({
  elapsedLabel,
  className,
  dataTestId,
}: {
  elapsedLabel: string;
  className?: string;
  dataTestId?: string;
}) {
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        "flex h-full min-h-[320px] items-center justify-center p-4",
        className,
      )}
    >
      <div className="w-full max-w-xl corner-notch-1 border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          Loading changed files
        </div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Noter is still loading the compare target and patch data for this
          view. This can take a few seconds on larger pull requests.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 corner-notch-1 border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700">
          <ClockIcon className="h-3.5 w-3.5 text-slate-500" />
          <span aria-label={`Elapsed compare load time ${elapsedLabel}`}>
            {elapsedLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
