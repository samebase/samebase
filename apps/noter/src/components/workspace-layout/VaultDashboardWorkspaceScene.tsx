import { type CSSProperties, type ReactNode } from "react";
import { DashboardWorkspaceLayout } from "@/components/workspace-layout/DashboardWorkspaceLayout";
import {
  WorkspaceScene,
  type WorkspaceBottomDockRenderProps,
} from "@/components/workspace-layout/WorkspaceScene";

type SidebarSlot = Exclude<ReactNode, undefined>;

export type VaultDashboardWorkspaceSceneViewModel = {
  dataTestId?: string;
  headerContent: ReactNode;
  leftSidebarContent: SidebarSlot;
  leftSidebarHeader: SidebarSlot;
  overlayContent?: ReactNode;
  bottomDock?: (props: WorkspaceBottomDockRenderProps) => ReactNode;
  rightSidebarContent: SidebarSlot;
  rightSidebarHeader: SidebarSlot;
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
  leftSidebarContent,
  leftSidebarHeader,
  overlayContent,
  bottomDock,
  rightSidebarContent,
  rightSidebarHeader,
  workspaceBody,
  workspacePaneClassName,
  workspaceScrollClassName,
  workspaceScrollStyle,
}: VaultDashboardWorkspaceSceneViewModel) {
  return (
    <DashboardWorkspaceLayout
      dataTestId={dataTestId}
      leftSidebarHeader={leftSidebarHeader}
      leftSidebarContent={leftSidebarContent}
      rightSidebarHeader={rightSidebarHeader}
      rightSidebarContent={rightSidebarContent}
      headerContent={headerContent}
      bodyClassName="flex min-h-0 flex-col"
    >
      <WorkspaceScene
        workspaceBody={workspaceBody}
        workspacePaneClassName={workspacePaneClassName}
        workspaceScrollClassName={workspaceScrollClassName}
        workspaceScrollStyle={workspaceScrollStyle}
        overlayContent={overlayContent}
        bottomDock={bottomDock}
      />
    </DashboardWorkspaceLayout>
  );
}
