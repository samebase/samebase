import { type CSSProperties, type ReactNode } from "react";
import { DashboardWorkspaceLayout } from "@/components/DashboardWorkspaceLayout";
import { cn } from "@/lib/utils";

export type VaultDashboardWorkspaceSceneViewModel = {
  dataTestId?: string;
  headerContent: ReactNode;
  overlayContent?: ReactNode;
  sidebarContent?: ReactNode;
  sidebarHeader?: ReactNode;
  workspaceBody: ReactNode;
  workspacePaneClassName?: string;
  workspaceScrollClassName?: string;
  workspaceScrollStyle?: CSSProperties;
};

/**
 * Centralizes the shared dashboard workspace chrome so both the live screen
 * and static visual fixtures render through the same workspace shell.
 */
export function VaultDashboardWorkspaceScene({
  dataTestId,
  headerContent,
  overlayContent,
  sidebarContent,
  sidebarHeader,
  workspaceBody,
  workspacePaneClassName,
  workspaceScrollClassName,
  workspaceScrollStyle,
}: VaultDashboardWorkspaceSceneViewModel) {
  return (
    <DashboardWorkspaceLayout
      dataTestId={dataTestId}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      headerContent={headerContent}
      bodyClassName={cn("flex min-h-0 flex-col", workspacePaneClassName)}
    >
      <div className="relative flex h-full min-h-0 flex-col">
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            workspaceScrollClassName,
          )}
          style={workspaceScrollStyle}
        >
          {workspaceBody}
        </div>
        {overlayContent}
      </div>
    </DashboardWorkspaceLayout>
  );
}
