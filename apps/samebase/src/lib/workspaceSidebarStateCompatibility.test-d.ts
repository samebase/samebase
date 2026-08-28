import type {
  WorkspaceSidebarState as PackageWorkspaceSidebarState,
  WorkspaceSidebarStateController as PackageWorkspaceSidebarStateController,
} from "@samebase/workspace-layout/state";
import type { WorkspaceSidebarState as ConvexWorkspaceSidebarState } from "../../convex/userPreferenceModel";
import type { usePersistedWorkspaceSidebarState } from "../hooks/usePersistedWorkspaceSidebarState";

type ConvexWorkspaceSidebarStateController = ReturnType<typeof usePersistedWorkspaceSidebarState>;

type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false;
type ExpectTrue<Value extends true> = Value;

export type WorkspaceSidebarStateCompatibility = [
  ExpectTrue<IsAssignable<ConvexWorkspaceSidebarState, PackageWorkspaceSidebarState>>,
  ExpectTrue<IsAssignable<PackageWorkspaceSidebarState, ConvexWorkspaceSidebarState>>,
  ExpectTrue<
    IsAssignable<ConvexWorkspaceSidebarStateController, PackageWorkspaceSidebarStateController>
  >,
  ExpectTrue<
    IsAssignable<PackageWorkspaceSidebarStateController, ConvexWorkspaceSidebarStateController>
  >,
];
