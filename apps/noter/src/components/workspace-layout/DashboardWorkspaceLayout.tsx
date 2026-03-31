import { type CSSProperties, type ReactNode } from "react";
import { WorkspaceRouteFrame } from "@/components/workspace-layout/WorkspaceRouteFrame";

type SidebarSlot = Exclude<ReactNode, undefined>;

export function DashboardWorkspaceLayout({
  leftSidebarHeader,
  leftSidebarContent,
  rightSidebarHeader,
  rightSidebarContent,
  headerContent,
  children,
  dataTestId,
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
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}) {
  return (
    <WorkspaceRouteFrame
      dataTestId={dataTestId}
      leftSidebarHeader={leftSidebarHeader}
      leftSidebarContent={leftSidebarContent}
      leftSidebarContentTestId="dashboard-layout-sidebar-content"
      rightSidebarHeader={rightSidebarHeader}
      rightSidebarContent={rightSidebarContent}
      rightSidebarContentTestId="dashboard-layout-right-sidebar-content"
      headerTestId="dashboard-layout-header"
      headerContent={headerContent}
      bodyTestId="dashboard-layout-body"
      bodyClassName={bodyClassName}
      bodyStyle={bodyStyle}
    >
      {children}
    </WorkspaceRouteFrame>
  );
}
