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
  dataTestId,
  headerTestId,
  leftSidebarContentTestId,
  rightSidebarContentTestId,
  bodyTestId,
  bodyClassName,
  bodyStyle,
}: {
  leftSidebarHeader: SidebarSlot;
  leftSidebarContent: SidebarSlot;
  rightSidebarHeader: SidebarSlot;
  rightSidebarContent: SidebarSlot;
  headerContent: ReactNode;
  children: ReactNode;
  dataTestId?: string;
  headerTestId?: string;
  leftSidebarContentTestId?: string;
  rightSidebarContentTestId?: string;
  bodyTestId?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}) {
  return (
    <WorkspaceSidebarShell
      dataTestId={dataTestId}
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
