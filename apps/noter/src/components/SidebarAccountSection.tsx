import { type ReactNode } from "react";

// TODO: remove
export function SidebarAccountSection({
  children,
  dataTestId,
}: {
  children: ReactNode;
  dataTestId?: string;
}) {
  return <div data-testid={dataTestId}>{children}</div>;
}
