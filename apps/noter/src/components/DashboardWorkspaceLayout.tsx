import { type CSSProperties, type ReactNode } from "react";
import { WorkspaceSidebarShell } from "@/components/WorkspaceSidebarShell";
import { cn } from "@/lib/utils";

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
  leftSidebarHeader?: ReactNode;
  leftSidebarContent?: ReactNode;
  rightSidebarHeader?: ReactNode;
  rightSidebarContent?: ReactNode;
  headerContent: ReactNode;
  children: ReactNode;
  dataTestId?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}) {
  return (
    <WorkspaceSidebarShell
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
      bodyClassName={cn("min-h-0 flex-1", bodyClassName)}
      bodyStyle={bodyStyle}
    >
      {children}
    </WorkspaceSidebarShell>
  );
}
