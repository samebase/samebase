import { DialogProvider } from "@/contexts/DialogContext";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import { RepositoryRouteConnectState } from "@/components/RepositoryRouteConnectState";
import { WorkspaceLayoutV2MemorySidebarProvider } from "@/components/workspace-layout-v2/WorkspaceLayoutV2MemorySidebarProvider";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "@/lib/fileViewSidebarLayout";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import { TestRouterProvider } from "@/test/TestRouterProvider";

export type RepositoryRouteConnectStateVisualMode =
  | "file-view-connect-repository"
  | "file-view-connect-github";

export function RepositoryRouteConnectStateVisualFixture({
  mode,
}: {
  mode: RepositoryRouteConnectStateVisualMode;
}) {
  const githubConnected = mode === "file-view-connect-repository";
  const initialSidebarState = {
    leftDesktopOpen: FILE_VIEW_TREE_SIDEBAR_SIDE === "left",
    leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    leftMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    mobilePane: "main",
    mobileSurface: { kind: "unmerged" },
    rightDesktopOpen: true,
    rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  } satisfies WorkspaceSidebarState;

  return (
    <TestRouterProvider>
      <DialogProvider>
        <WorkspaceLayoutV2MemorySidebarProvider
          initialState={initialSidebarState}
          shortcutPaneSide={FILE_VIEW_TREE_SIDEBAR_SIDE}
        >
          <div className="flex h-screen flex-col">
            <RepositoryRouteConnectState
              dataTestId="file-view-connect-route-visual-fixture"
              repositoryFullName="facebook/react"
              githubConnected={githubConnected}
              isConnectingGithub={false}
              isConnectingRepository={false}
              errorMessage={null}
              onConnectGithub={() => {}}
              onConnectRepository={() => {}}
            />
          </div>
        </WorkspaceLayoutV2MemorySidebarProvider>
      </DialogProvider>
    </TestRouterProvider>
  );
}
