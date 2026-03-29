import { type CSSProperties, type ReactNode } from "react";
import { WorkspaceSidebarShell } from "@/components/WorkspaceSidebarShell";
import { cn } from "@/lib/utils";

export function DashboardWorkspaceLayout({
  sidebarHeader,
  sidebarContent,
  headerContent,
  children,
  dataTestId,
  bodyClassName,
  bodyStyle,
}: {
  sidebarHeader?: ReactNode;
  sidebarContent?: ReactNode;
  headerContent: ReactNode;
  children: ReactNode;
  dataTestId?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}) {
  return (
    <WorkspaceSidebarShell
      dataTestId={dataTestId}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      sidebarContentTestId="dashboard-layout-sidebar-content"
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
