import * as React from "react";
import { WorkspaceMobilePaneDragContext } from "@/components/workspaceMobilePaneDragContext";

export function useWorkspaceMobilePaneDrag() {
  return React.useContext(WorkspaceMobilePaneDragContext);
}
