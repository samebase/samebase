import type { ReactNode } from "react";
import { ForcedMobileSidebarContext } from "@/lib/forcedMobileSidebarContext";

export function ForcedMobileSidebarProvider({
  children,
  forceMobile,
}: {
  children: ReactNode;
  forceMobile?: boolean;
}) {
  return (
    <ForcedMobileSidebarContext.Provider value={forceMobile === true}>
      {children}
    </ForcedMobileSidebarContext.Provider>
  );
}
