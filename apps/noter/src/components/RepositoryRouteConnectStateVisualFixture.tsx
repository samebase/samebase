import { DialogProvider } from "@/contexts/DialogContext";
import { RepositoryRouteConnectState } from "@/components/RepositoryRouteConnectState";
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

  return (
    <TestRouterProvider>
      <DialogProvider>
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
      </DialogProvider>
    </TestRouterProvider>
  );
}
