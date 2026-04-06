import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspaceLayoutV2TopBar({
  children,
  className,
  contentClassName,
  dataTestId,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  dataTestId?: string;
}) {
  return (
    <div className={cn("border-b border-border/50", className)}>
      <div
        data-testid={dataTestId}
        className={cn(
          "container flex items-center gap-3 px-3 py-1 text-[11px] text-muted-foreground",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
