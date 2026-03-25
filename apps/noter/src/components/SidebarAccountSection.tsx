import { type ReactNode } from "react";

export function SidebarAccountSection({
  children,
  dataTestId,
}: {
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <div data-testid={dataTestId} className="border-b border-border/50 p-3">
      {children}
    </div>
  );
}
