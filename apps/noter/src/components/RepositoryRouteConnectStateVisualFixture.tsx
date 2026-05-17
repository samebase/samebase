import { DialogProvider } from "#src/contexts/DialogContext.tsx";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import { RepositoryRouteConnectState } from "#src/components/RepositoryRouteConnectState.tsx";
import { WorkspaceLayoutV2MemorySidebarProvider } from "#src/components/workspace-layout-v2/WorkspaceLayoutV2MemorySidebarProvider.tsx";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "#src/lib/fileViewSidebarLayout.ts";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "#src/lib/workspacePaneSizes.ts";
import { TestRouterProvider } from "#src/test/TestRouterProvider.tsx";

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
