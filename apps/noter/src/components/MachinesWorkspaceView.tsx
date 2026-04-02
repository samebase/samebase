import { SidebarProvider } from "@/components/sidebar";
import { MachinesWorkspaceSidebarRail } from "@/components/MachinesWorkspaceSidebarRail";
import type { MachinesWorkspaceViewProps } from "@/components/MachinesWorkspaceSidebarRail";
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";

export type { MachinesWorkspaceViewProps } from "@/components/MachinesWorkspaceSidebarRail";

/**
 * Keep the shipped `/machines` route on the existing shared workspace shell
 * while letting the sidebar rail and thread pane stay reusable for v2.
 */
export function MachinesWorkspaceView(props: MachinesWorkspaceViewProps) {
  const sidebarTestId = props.dataTestId
    ? `${props.dataTestId}-sidebar`
    : undefined;
  const headerTestId = props.dataTestId
    ? `${props.dataTestId}-header`
    : undefined;

  return (
    <SidebarProvider
      className="h-full min-h-0"
      defaultOpen={true}
      defaultLeftDesktopWidthPx={288}
      defaultLeftMobileWidthPx={288}
    >
      <RepositoryWorkspaceFrame
        dataTestId={props.dataTestId}
        headerTestId={headerTestId}
        contentClassName="min-h-0 flex-1 p-0"
        leftSidebarHeader={null}
        leftSidebarContent={
          <MachinesWorkspaceSidebarRail
            dataTestId={sidebarTestId}
            machineInventories={props.machineInventories}
            selectedMachineId={props.selectedMachineId}
            selectedThreadId={props.selectedThreadId}
            pendingPinThreadKey={props.pendingPinThreadKey}
            relativeTimeReferenceMs={props.relativeTimeReferenceMs}
            onThreadPinChange={props.onThreadPinChange}
            onThreadSelect={props.onThreadSelect}
          />
        }
        rightSidebarHeader={null}
        rightSidebarContent={null}
      >
        <WorkspaceScene
          workspacePaneClassName="bg-background"
          workspaceScrollClassName="overflow-hidden bg-background"
          workspaceBody={
            <MachinesWorkspaceThreadPane
              errorMessage={props.selectedThreadError}
              isLoading={props.selectedThreadLoading}
              isSubmittingTurn={props.isSubmittingTurn}
              onTurnDraftChange={props.onTurnDraftChange}
              onTurnSubmit={props.onTurnSubmit}
              selectedMachineDisplayName={props.selectedMachineDisplayName}
              selectedMachineHostname={props.selectedMachineHostname}
              selectedMachineStatusReason={props.selectedMachineStatusReason}
              selectedThreadId={props.selectedThreadId}
              thread={props.selectedThread}
              turnDraft={props.turnDraft}
            />
          }
        />
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
