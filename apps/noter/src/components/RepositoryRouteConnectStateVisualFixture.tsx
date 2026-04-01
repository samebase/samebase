import { DialogProvider } from "@/contexts/DialogContext";
import { SidebarProvider } from "@/components/sidebar";
import { RepositoryRouteConnectState } from "@/components/RepositoryRouteConnectState";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "@/lib/fileViewSidebarLayout";
import { MemoryRouter } from "react-router-dom";

export type RepositoryRouteConnectStateVisualMode =
  "file-view-connect-repository";

export function RepositoryRouteConnectStateVisualFixture({
  mode,
}: {
  mode: RepositoryRouteConnectStateVisualMode;
}) {
  mode satisfies RepositoryRouteConnectStateVisualMode;

  return (
    <MemoryRouter>
      <DialogProvider>
        <SidebarProvider
          defaultOpen={FILE_VIEW_TREE_SIDEBAR_SIDE === "left"}
          defaultRightOpen={true}
          shortcutSidebarSide={FILE_VIEW_TREE_SIDEBAR_SIDE}
          className="min-h-screen bg-background text-foreground"
        >
          <RepositoryRouteConnectState
            dataTestId="file-view-connect-route-visual-fixture"
            repositoryFullName="facebook/react"
            githubConnected={true}
            isConnectingGithub={false}
            isConnectingRepository={false}
            errorMessage={null}
            onConnectGithub={() => {}}
            onConnectRepository={() => {}}
          />
        </SidebarProvider>
      </DialogProvider>
    </MemoryRouter>
  );
}
