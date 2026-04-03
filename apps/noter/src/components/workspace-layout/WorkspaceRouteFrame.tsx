import { type CSSProperties, type ReactNode } from "react";
import { WorkspaceSidebarShell } from "@/components/workspace-layout/WorkspaceSidebarShell";
import { cn } from "@/lib/utils";

type SidebarSlot = Exclude<ReactNode, undefined>;

export function WorkspaceRouteFrame({
  leftSidebarHeader,
  leftSidebarContent,
  rightSidebarHeader,
  rightSidebarContent,
  headerContent,
  children,
  clampSidebarWidthsToShell,
  dataTestId,
  headerTestId,
  leftSidebarContentTestId,
  rightSidebarContentTestId,
  bodyTestId,
  bodyClassName,
  bodyStyle,
  mobilePaneSettleMode,
}: {
  leftSidebarHeader: SidebarSlot;
  leftSidebarContent: SidebarSlot;
  rightSidebarHeader: SidebarSlot;
  rightSidebarContent: SidebarSlot;
  headerContent: ReactNode;
  children: ReactNode;
  clampSidebarWidthsToShell?: boolean;
  dataTestId?: string;
  headerTestId?: string;
  leftSidebarContentTestId?: string;
  rightSidebarContentTestId?: string;
  bodyTestId?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  mobilePaneSettleMode?: "adjacent-only" | "legacy";
}) {
  return (
    <WorkspaceSidebarShell
      clampSidebarWidthsToShell={clampSidebarWidthsToShell}
      dataTestId={dataTestId}
      mobilePaneSettleMode={mobilePaneSettleMode}
      leftSidebarHeader={leftSidebarHeader}
      leftSidebarContent={leftSidebarContent}
      leftSidebarContentTestId={leftSidebarContentTestId}
      rightSidebarHeader={rightSidebarHeader}
      rightSidebarContent={rightSidebarContent}
      rightSidebarContentTestId={rightSidebarContentTestId}
      headerTestId={headerTestId}
      headerContent={headerContent}
      bodyTestId={bodyTestId}
      bodyClassName={cn("min-h-0 flex-1", bodyClassName)}
      bodyStyle={bodyStyle}
    >
      {children}
    </WorkspaceSidebarShell>
  );
}
