import { type ReactNode } from "react";
import { MagnifyingGlassIcon } from "@/lib/radixIcons";
import { Button } from "@/components/ui/button";

/**
 * Keep repository-style route headers on the shared compact v2 pane row so
 * routes provide content while the workspace shell owns toggles and sizing.
 */
export function RepositoryWorkspacePaneHeader({
  middle,
  onQuickOpen,
  right,
  title,
}: {
  middle?: ReactNode;
  onQuickOpen?: () => void;
  right?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 items-center gap-2">
      {onQuickOpen ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Quick Open"
          title="Quick Open (Cmd+P)"
          className="h-8 w-8 shrink-0"
          onClick={onQuickOpen}
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
        </Button>
      ) : null}

      <div className="min-w-0 flex-1 overflow-hidden">
        {middle ??
          (title ? (
            <span className="block truncate text-sm font-medium">{title}</span>
          ) : null)}
      </div>

      {right ? (
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      ) : null}
    </div>
  );
}
