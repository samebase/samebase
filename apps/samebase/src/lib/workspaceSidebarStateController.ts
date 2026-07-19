import type { WorkspaceSidebarState } from "../../convex/userPreferenceModel";

export type WorkspaceSidebarStatePersistenceMode = "immediate" | "width_deferred";

export type WorkspaceSidebarStateUpdate = (
  currentState: WorkspaceSidebarState,
) => WorkspaceSidebarState;

export type WorkspaceSidebarStateController = {
  isHydrated: boolean;
  state: WorkspaceSidebarState;
  setState: (
    updateState: WorkspaceSidebarStateUpdate,
    persistenceMode: WorkspaceSidebarStatePersistenceMode,
  ) => void;
};
