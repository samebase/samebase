import { type ReactNode } from "react";

export function WorkspaceLayoutV2TopBar({
  children,
  dataTestId,
}: {
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <div className="h-5 shrink-0 border-b border-border/50">
      <div
        data-testid={dataTestId}
        className="container flex h-full items-center overflow-hidden px-3 text-[11px] leading-none text-muted-foreground"
      >
        {children}
      </div>
    </div>
  );
}
