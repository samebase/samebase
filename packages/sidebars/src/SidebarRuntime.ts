import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  SidebarRuntimeProvider,
  useSidebarLayoutSelector,
  useSidebarRuntimeActions as useSidebarRuntimeActionsInternal,
  useSidebarRuntimeState,
} from "./SidebarRuntimeInternal.tsx";
import {
  getSidebarLayoutPresentation,
  useSidebarLayoutDisplayedMobileState,
  type SidebarLayoutPresentation,
} from "./SidebarLayoutPresentation.ts";
import type { MobilePane } from "./SidebarLayoutState.ts";

export { SidebarRuntimeProvider };
export type { SidebarRuntimeProviderProps } from "./SidebarRuntimeInternal.tsx";
export type {
  SidebarLayoutPresentation,
  SidebarLayoutMobileMergeProgress,
} from "./SidebarLayoutPresentation.ts";
export type {
  MobilePane,
  SidebarSide,
  SidebarLayoutStateController,
} from "./SidebarLayoutState.ts";

export type SidebarActions = {
  setMobilePane: Dispatch<SetStateAction<MobilePane>>;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
};

export function useSidebarActions(): SidebarActions {
  const { setMobilePane, toggleLeftPane, toggleRightPane } = useSidebarRuntimeActionsInternal();

  return useMemo(
    () => ({ setMobilePane, toggleLeftPane, toggleRightPane }),
    [setMobilePane, toggleLeftPane, toggleRightPane],
  );
}

export function useSidebarLayoutPresentation(): SidebarLayoutPresentation {
  const displayedMobileState = useSidebarLayoutDisplayedMobileState();
  const paneState = useSidebarRuntimeState();
  const localState = useSidebarLayoutSelector((state) => state);

  return getSidebarLayoutPresentation({ displayedMobileState, localState, paneState });
}
