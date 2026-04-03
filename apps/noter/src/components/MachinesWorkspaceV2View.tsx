import { SidebarProvider } from "@/components/sidebar";
import {
  MachinesWorkspaceSidebarRail,
  type MachinesWorkspaceViewProps,
} from "@/components/MachinesWorkspaceSidebarRail";
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";

/**
 * `/v2/machines` keeps the shared workspace chrome and empty-pane semantics,
 * but uses adjacent-only mobile pane settling so sidebars require two swipes
 * to cross through the main view.
 */
export function MachinesWorkspaceV2View(props: MachinesWorkspaceViewProps) {
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
      defaultRightOpen={true}
      defaultLeftDesktopWidthPx={288}
      defaultLeftMobileWidthPx={288}
      defaultRightDesktopWidthPx={288}
      defaultRightMobileWidthPx={288}
    >
      <RepositoryWorkspaceFrame
        clampSidebarWidthsToShell={false}
        dataTestId={props.dataTestId}
        headerTestId={headerTestId}
        contentClassName="min-h-0 flex-1 p-0"
        mobilePaneSettleMode="adjacent-only"
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
            onThreadSelect={({ machineId, threadId }) => {
              props.onThreadSelect?.({ machineId, threadId });
            }}
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
              mobilePaneDragEnabled
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
