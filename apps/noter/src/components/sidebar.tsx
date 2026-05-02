import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
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

function resolveNextState<T>(currentValue: T, nextValue: SetStateAction<T>) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
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
  const [internalMobilePane, setInternalMobilePane] =
    useState<MobileSidebarPane>(defaultMobilePane);
  const [internalLeftDesktopOpen, setInternalLeftDesktopOpen] =
    useState(defaultOpen);
  const [internalRightDesktopOpen, setInternalRightDesktopOpen] =
    useState(defaultRightOpen);
  const [internalLeftDesktopWidthPx, setInternalLeftDesktopWidthPx] = useState(
    defaultLeftDesktopWidthPx,
  );
  const [internalRightDesktopWidthPx, setInternalRightDesktopWidthPx] =
    useState(defaultRightDesktopWidthPx);
  const [internalLeftMobileWidthPx, setInternalLeftMobileWidthPx] = useState(
    defaultLeftMobileWidthPx,
  );
  const [internalRightMobileWidthPx, setInternalRightMobileWidthPx] = useState(
    defaultRightMobileWidthPx,
  );
  // `open`/`onOpenChange` only alias the shortcut side. Explicit left/right
  // props always win, and the matching setter prefers side-specific control
  // before falling back to the shortcut alias or internal state.
  const controlledLeftOpen =
    leftOpenProp ?? (shortcutSidebarSide === "left" ? openProp : undefined);
  const controlledRightOpen =
    rightOpenProp ?? (shortcutSidebarSide === "right" ? openProp : undefined);
  const leftDesktopOpen = controlledLeftOpen ?? internalLeftDesktopOpen;
  const rightDesktopOpen = controlledRightOpen ?? internalRightDesktopOpen;
  const leftDesktopWidthPx =
    leftDesktopWidthPxProp ?? internalLeftDesktopWidthPx;
  const rightDesktopWidthPx =
    rightDesktopWidthPxProp ?? internalRightDesktopWidthPx;
  const leftMobileWidthPx = leftMobileWidthPxProp ?? internalLeftMobileWidthPx;
  const rightMobileWidthPx =
    rightMobileWidthPxProp ?? internalRightMobileWidthPx;
  const mobilePane = mobilePaneProp ?? internalMobilePane;

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
      setInternalLeftDesktopOpen(nextValue);
    },
    [leftDesktopOpen, setLeftOpenProp, setOpenProp, shortcutSidebarSide],
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
      setInternalRightDesktopOpen(nextValue);
    },
    [rightDesktopOpen, setOpenProp, setRightOpenProp, shortcutSidebarSide],
  );

  const setLeftDesktopWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(leftDesktopWidthPx, value);
      if (setLeftDesktopWidthPxProp) {
        setLeftDesktopWidthPxProp(nextValue);
        return;
      }
      setInternalLeftDesktopWidthPx(nextValue);
    },
    [leftDesktopWidthPx, setLeftDesktopWidthPxProp],
  );

  const setRightDesktopWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(rightDesktopWidthPx, value);
      if (setRightDesktopWidthPxProp) {
        setRightDesktopWidthPxProp(nextValue);
        return;
      }
      setInternalRightDesktopWidthPx(nextValue);
    },
    [rightDesktopWidthPx, setRightDesktopWidthPxProp],
  );

  const setLeftMobileWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(leftMobileWidthPx, value);
      if (setLeftMobileWidthPxProp) {
        setLeftMobileWidthPxProp(nextValue);
        return;
      }
      setInternalLeftMobileWidthPx(nextValue);
    },
    [leftMobileWidthPx, setLeftMobileWidthPxProp],
  );

  const setRightMobileWidthPx = useCallback(
    (value: SetStateAction<number>) => {
      const nextValue = resolveNextState(rightMobileWidthPx, value);
      if (setRightMobileWidthPxProp) {
        setRightMobileWidthPxProp(nextValue);
        return;
      }
      setInternalRightMobileWidthPx(nextValue);
    },
    [rightMobileWidthPx, setRightMobileWidthPxProp],
  );

  const setMobilePane = useCallback(
    (value: SetStateAction<MobileSidebarPane>) => {
      const nextValue = resolveNextState(mobilePane, value);
      if (setMobilePaneProp) {
        setMobilePaneProp(nextValue);
        return;
      }
      setInternalMobilePane(nextValue);
    },
    [mobilePane, setMobilePaneProp],
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
