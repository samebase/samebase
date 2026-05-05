import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

export type WorkspaceSidebarStatePersistenceMode =
  | "immediate"
  | "width_deferred";

export type WorkspaceSidebarStateUpdate =
  | WorkspaceSidebarState
  | ((currentState: WorkspaceSidebarState) => WorkspaceSidebarState);

export type WorkspaceSidebarStateController = {
  isHydrated: boolean;
  state: WorkspaceSidebarState;
  setState: (
    nextState: WorkspaceSidebarStateUpdate,
    persistenceMode: WorkspaceSidebarStatePersistenceMode,
  ) => void;
};
