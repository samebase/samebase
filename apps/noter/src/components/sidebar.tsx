import { useCreateStore, useSelector } from "@tanstack/react-store";
import {
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  SidebarContext,
  type SidebarContextProps,
  type MobileSidebarPane,
  type SidebarSide,
} from "@/hooks/use-sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";

const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarProviderStoreState = {
  leftDesktopOpen: boolean;
  leftDesktopWidthPx: number;
  leftMobileWidthPx: number;
  mobilePane: MobileSidebarPane;
  rightDesktopOpen: boolean;
  rightDesktopWidthPx: number;
  rightMobileWidthPx: number;
};

function resolveNextState<T>(currentValue: T, nextValue: SetStateAction<T>) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
}

function setSidebarProviderStoreValue<
  Key extends keyof SidebarProviderStoreState,
>(
  state: SidebarProviderStoreState,
  key: Key,
  value: SidebarProviderStoreState[Key],
): SidebarProviderStoreState {
  if (state[key] === value) {
    return state;
  }

  const nextState = { ...state };
  nextState[key] = value;
  return nextState;
}

/**
 * Owns the provider's uncontrolled fallback values. Controlled props still win
 * at render time; the store only replaces the previous local `useState` group.
 */
function useCreateSidebarProviderStore(
  initialState: SidebarProviderStoreState,
) {
  return useCreateStore(initialState, ({ setState }) => ({
    setValue: <Key extends keyof SidebarProviderStoreState>(
      key: Key,
      value: SidebarProviderStoreState[Key],
    ) => {
      setState((state) => setSidebarProviderStoreValue(state, key, value));
    },
  }));
}

type Props = {
  children: ReactNode;

  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  leftOpen?: boolean;
  onLeftOpenChange?: (open: boolean) => void;
  defaultRightOpen?: boolean;
  rightOpen?: boolean;
  onRightOpenChange?: (open: boolean) => void;
  defaultLeftDesktopWidthPx?: number;
  leftDesktopWidthPx?: number;
  onLeftDesktopWidthPxChange?: (widthPx: number) => void;
  defaultRightDesktopWidthPx?: number;
  rightDesktopWidthPx?: number;
  onRightDesktopWidthPxChange?: (widthPx: number) => void;
  defaultLeftMobileWidthPx?: number;
  leftMobileWidthPx?: number;
  onLeftMobileWidthPxChange?: (widthPx: number) => void;
  defaultRightMobileWidthPx?: number;
  rightMobileWidthPx?: number;
  onRightMobileWidthPxChange?: (widthPx: number) => void;
  defaultMobilePane?: MobileSidebarPane;
  mobilePane?: MobileSidebarPane;
  onMobilePaneChange?: (pane: MobileSidebarPane) => void;
  shortcutSidebarSide?: SidebarSide;
};

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  leftOpen: leftOpenProp,
  onLeftOpenChange: setLeftOpenProp,
  defaultRightOpen = false,
  rightOpen: rightOpenProp,
  onRightOpenChange: setRightOpenProp,
  defaultLeftDesktopWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  leftDesktopWidthPx: leftDesktopWidthPxProp,
  onLeftDesktopWidthPxChange: setLeftDesktopWidthPxProp,
  defaultRightDesktopWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  rightDesktopWidthPx: rightDesktopWidthPxProp,
  onRightDesktopWidthPxChange: setRightDesktopWidthPxProp,
  defaultLeftMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: leftMobileWidthPxProp,
  onLeftMobileWidthPxChange: setLeftMobileWidthPxProp,
  defaultRightMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: rightMobileWidthPxProp,
  onRightMobileWidthPxChange: setRightMobileWidthPxProp,
  defaultMobilePane = "main",
  mobilePane: mobilePaneProp,
  onMobilePaneChange: setMobilePaneProp,
  shortcutSidebarSide = "left",
  children,
}: Props) {
  const isMobile = useIsMobile();
  const store = useCreateSidebarProviderStore({
    leftDesktopOpen: defaultOpen,
    leftDesktopWidthPx: defaultLeftDesktopWidthPx,
    leftMobileWidthPx: defaultLeftMobileWidthPx,
    mobilePane: defaultMobilePane,
    rightDesktopOpen: defaultRightOpen,
    rightDesktopWidthPx: defaultRightDesktopWidthPx,
    rightMobileWidthPx: defaultRightMobileWidthPx,
  });
  const internalState = useSelector(store, (state) => state);
  const internalActions = store.actions;
  // `open`/`onOpenChange` only alias the shortcut side. Explicit left/right
  // props always win, and the matching setter prefers side-specific control
  // before falling back to the shortcut alias or internal state.
  const controlledLeftOpen =
    leftOpenProp ?? (shortcutSidebarSide === "left" ? openProp : undefined);
  const controlledRightOpen =
    rightOpenProp ?? (shortcutSidebarSide === "right" ? openProp : undefined);
  const leftDesktopOpen = controlledLeftOpen ?? internalState.leftDesktopOpen;
  const rightDesktopOpen =
    controlledRightOpen ?? internalState.rightDesktopOpen;
  const leftDesktopWidthPx =
    leftDesktopWidthPxProp ?? internalState.leftDesktopWidthPx;
  const rightDesktopWidthPx =
    rightDesktopWidthPxProp ?? internalState.rightDesktopWidthPx;
  const leftMobileWidthPx =
    leftMobileWidthPxProp ?? internalState.leftMobileWidthPx;
  const rightMobileWidthPx =
    rightMobileWidthPxProp ?? internalState.rightMobileWidthPx;
  const mobilePane = mobilePaneProp ?? internalState.mobilePane;

  const setLeftDesktopOpen = useCallback(
    (value: SetStateAction<boolean>) => {
      const nextValue = resolveNextState(leftDesktopOpen, value);
      if (setLeftOpenProp) {
        setLeftOpenProp(nextValue);
        return;
      }
      if (shortcutSidebarSide === "left" && setOpenProp) {
        setOpenProp(nextValue);
        return;
      }
      internalActions.setValue("leftDesktopOpen", nextValue);
    },
    [
      internalActions,
      leftDesktopOpen,
      setLeftOpenProp,
      setOpenProp,
      shortcutSidebarSide,
    ],
  );

  const setRightDesktopOpen = useCallback(
    (value: SetStateAction<boolean>) => {
      const nextValue = resolveNextState(rightDesktopOpen, value);
      if (setRightOpenProp) {
        setRightOpenProp(nextValue);
        return;
      }
      if (shortcutSidebarSide === "right" && setOpenProp) {
        setOpenProp(nextValue);
        return;
      }
      internalActions.setValue("rightDesktopOpen", nextValue);
    },
    [
      internalActions,
      rightDesktopOpen,
      setOpenProp,
      setRightOpenProp,
      shortcutSidebarSide,
    ],
  );

  const setLeftDesktopWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(leftDesktopWidthPx, value);
      if (setLeftDesktopWidthPxProp) {
        setLeftDesktopWidthPxProp(nextValue);
        return;
      }
      internalActions.setValue("leftDesktopWidthPx", nextValue);
    },
    [internalActions, leftDesktopWidthPx, setLeftDesktopWidthPxProp],
  );

  const setRightDesktopWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(rightDesktopWidthPx, value);
      if (setRightDesktopWidthPxProp) {
        setRightDesktopWidthPxProp(nextValue);
        return;
      }
      internalActions.setValue("rightDesktopWidthPx", nextValue);
    },
    [internalActions, rightDesktopWidthPx, setRightDesktopWidthPxProp],
  );

  const setLeftMobileWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(leftMobileWidthPx, value);
      if (setLeftMobileWidthPxProp) {
        setLeftMobileWidthPxProp(nextValue);
        return;
      }
      internalActions.setValue("leftMobileWidthPx", nextValue);
    },
    [internalActions, leftMobileWidthPx, setLeftMobileWidthPxProp],
  );

  const setRightMobileWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(rightMobileWidthPx, value);
      if (setRightMobileWidthPxProp) {
        setRightMobileWidthPxProp(nextValue);
        return;
      }
      internalActions.setValue("rightMobileWidthPx", nextValue);
    },
    [internalActions, rightMobileWidthPx, setRightMobileWidthPxProp],
  );

  const setMobilePane = useCallback(
    (value: SetStateAction<MobileSidebarPane>) => {
      const nextValue = resolveNextState(mobilePane, value);
      if (setMobilePaneProp) {
        setMobilePaneProp(nextValue);
        return;
      }
      internalActions.setValue("mobilePane", nextValue);
    },
    [internalActions, mobilePane, setMobilePaneProp],
  );

  const toggleLeftSidebar = useCallback(() => {
    if (isMobile) {
      setMobilePane((currentPane) =>
        currentPane === "left" ? "main" : "left",
      );
      return;
    }

    setLeftDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setLeftDesktopOpen, setMobilePane]);

  const toggleRightSidebar = useCallback(() => {
    if (isMobile) {
      setMobilePane((currentPane) =>
        currentPane === "right" ? "main" : "right",
      );
      return;
    }

    setRightDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setMobilePane, setRightDesktopOpen]);

  /**
   * Registers the global sidebar shortcut at the provider boundary so route
   * content can keep using `useSidebar` without owning keyboard listeners.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        if (shortcutSidebarSide === "right") {
          toggleRightSidebar();
          return;
        }
        toggleLeftSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcutSidebarSide, toggleLeftSidebar, toggleRightSidebar]);

  const primaryDesktopOpen =
    shortcutSidebarSide === "right" ? rightDesktopOpen : leftDesktopOpen;
  const setPrimaryDesktopOpen =
    shortcutSidebarSide === "right" ? setRightDesktopOpen : setLeftDesktopOpen;
  const togglePrimarySidebar =
    shortcutSidebarSide === "right" ? toggleRightSidebar : toggleLeftSidebar;

  const contextValue = useMemo<SidebarContextProps>(
    () => ({
      isMobile,
      leftDesktopOpen,
      leftDesktopWidthPx,
      leftMobileWidthPx,
      setLeftDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      rightDesktopOpen,
      rightDesktopWidthPx,
      rightMobileWidthPx,
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      mobilePane,
      setMobilePane,
      toggleLeftSidebar,
      toggleRightSidebar,
      state: primaryDesktopOpen ? "expanded" : "collapsed",
      open: primaryDesktopOpen,
      setOpen: setPrimaryDesktopOpen,
      openMobile: mobilePane === shortcutSidebarSide,
      setOpenMobile: (nextOpen: boolean) =>
        setMobilePane(nextOpen ? shortcutSidebarSide : "main"),
      toggleSidebar: togglePrimarySidebar,
    }),
    [
      isMobile,
      leftDesktopOpen,
      leftDesktopWidthPx,
      leftMobileWidthPx,
      setLeftDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      rightDesktopOpen,
      rightDesktopWidthPx,
      rightMobileWidthPx,
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      mobilePane,
      setMobilePane,
      toggleLeftSidebar,
      toggleRightSidebar,
      primaryDesktopOpen,
      setPrimaryDesktopOpen,
      shortcutSidebarSide,
      togglePrimarySidebar,
    ],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  );
}
