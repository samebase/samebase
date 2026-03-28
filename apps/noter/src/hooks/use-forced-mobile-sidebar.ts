import * as React from "react";
import { ForcedMobileSidebarContext } from "@/lib/forcedMobileSidebarContext";

export function useForcedMobileSidebar() {
  return React.useContext(ForcedMobileSidebarContext);
}
