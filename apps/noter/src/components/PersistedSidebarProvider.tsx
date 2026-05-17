import type { ComponentProps } from "react";
import { WorkspacePaneRuntimeProvider } from "#src/components/workspace-layout-v2/WorkspacePaneRuntime.tsx";
import { usePersistedWorkspaceSidebarState } from "#src/hooks/usePersistedWorkspaceSidebarState.ts";
import type {
  WorkspaceSidebarState,
  WorkspaceSidebarStateKey,
} from "../../convex/workspaceSidebarStateModel";

type PersistedSidebarProviderProps = Omit<
  ComponentProps<typeof WorkspacePaneRuntimeProvider>,
  "controller"
> & {
  defaultState: WorkspaceSidebarState;
  workspaceKey: WorkspaceSidebarStateKey;
};

export function PersistedSidebarProvider({
  defaultState,
  workspaceKey,
  ...props
}: PersistedSidebarProviderProps) {
  const sidebarState = usePersistedWorkspaceSidebarState({
    defaults: defaultState,
    workspaceKey,
  });

  return <WorkspacePaneRuntimeProvider {...props} controller={sidebarState} />;
}
