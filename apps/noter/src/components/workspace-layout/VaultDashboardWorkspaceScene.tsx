import { type ReactNode } from "react";
import { WorkspaceLayoutV2FullPage } from "../workspace-layout-v2/WorkspaceLayoutV2";

type SidebarSlot = Exclude<ReactNode, undefined>;

export type VaultDashboardWorkspaceSceneViewModel = {
  dataTestId?: string;
  headerContent: ReactNode;
  leftSidebarContent: SidebarSlot;
  leftSidebarHeader: SidebarSlot;
  rightSidebarContent: SidebarSlot;
  rightSidebarHeader: SidebarSlot;
  workspaceBody: ReactNode;
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
  rightSidebarContent,
  rightSidebarHeader,
  workspaceBody,
}: VaultDashboardWorkspaceSceneViewModel) {
  return (
    <WorkspaceLayoutV2FullPage
      dataTestId={dataTestId}
      topBar={null}
      left={{
        header: leftSidebarHeader,
        content: leftSidebarContent,
      }}
      main={{
        header: headerContent,
        content: workspaceBody,
      }}
      right={{
        header: rightSidebarHeader,
        content: rightSidebarContent,
      }}
    />
  );
}
