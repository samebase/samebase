import * as React from "react";
import { WorkspaceMobilePaneDragContext } from "@/components/workspace-layout/workspaceMobilePaneDragContext";

export function useWorkspaceMobilePaneDrag() {
  return React.useContext(WorkspaceMobilePaneDragContext);
}
