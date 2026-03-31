import type { ReactNode } from "react";
import {
  WorkspaceMobilePaneDragContext,
  type WorkspaceMobilePaneDragContextValue,
} from "@/components/workspace-layout/workspaceMobilePaneDragContext";

/**
 * Lets descendant editor surfaces delegate horizontal drag into the shared
 * mobile workspace carousel without reimplementing pane math locally.
 */
export function WorkspaceMobilePaneDragProvider({
  value,
  children,
}: {
  value: WorkspaceMobilePaneDragContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceMobilePaneDragContext.Provider value={value}>
      {children}
    </WorkspaceMobilePaneDragContext.Provider>
  );
}
