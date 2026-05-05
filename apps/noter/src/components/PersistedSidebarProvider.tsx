import type { ComponentProps } from "react";
import { WorkspaceLayoutSidebarProvider } from "@/components/workspace-layout-v2/WorkspaceLayoutSidebarProvider";
import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";
import type {
  WorkspaceSidebarState,
  WorkspaceSidebarStateKey,
} from "../../convex/workspaceSidebarStateModel";

type PersistedSidebarProviderProps = Omit<
  ComponentProps<typeof WorkspaceLayoutSidebarProvider>,
  "state"
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

  return <WorkspaceLayoutSidebarProvider {...props} state={sidebarState} />;
}
