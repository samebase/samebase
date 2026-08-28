import type {
  SidebarLayoutState as PackageSidebarLayoutState,
  SidebarLayoutStateController as PackageSidebarLayoutStateController,
} from "@samebase/sidebars/state";
import type { WorkspaceSidebarState as ConvexWorkspaceSidebarState } from "../../convex/userPreferenceModel";
import type { usePersistedWorkspaceSidebarState } from "../hooks/usePersistedWorkspaceSidebarState";

type ConvexWorkspaceSidebarStateController = ReturnType<typeof usePersistedWorkspaceSidebarState>;

type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false;
type ExpectTrue<Value extends true> = Value;

export type WorkspaceSidebarStateCompatibility = [
  ExpectTrue<IsAssignable<ConvexWorkspaceSidebarState, PackageSidebarLayoutState>>,
  ExpectTrue<IsAssignable<PackageSidebarLayoutState, ConvexWorkspaceSidebarState>>,
  ExpectTrue<
    IsAssignable<ConvexWorkspaceSidebarStateController, PackageSidebarLayoutStateController>
  >,
  ExpectTrue<
    IsAssignable<PackageSidebarLayoutStateController, ConvexWorkspaceSidebarStateController>
  >,
];
