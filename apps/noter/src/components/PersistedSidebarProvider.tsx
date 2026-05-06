import type { ComponentProps } from "react";
import { WorkspacePaneRuntimeProvider } from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";
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
