import { type ReactNode } from "react";

export function SidebarAccountSection({ children }: { children: ReactNode }) {
  return <div className="border-b border-border/50 p-3">{children}</div>;
}
