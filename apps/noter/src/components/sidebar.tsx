import * as React from "react";
import { PanelLeft } from "lucide-react";
import {
  SidebarContext,
  type SidebarContextProps,
  type MobileSidebarPane,
  type SidebarSide,
  useSidebar,
} from "@/hooks/use-sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

function resolveNextState<T>(
  currentValue: T,
  nextValue: React.SetStateAction<T>,
) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
}

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
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
    mobilePane?: MobileSidebarPane;
    onMobilePaneChange?: (pane: MobileSidebarPane) => void;
    shortcutSidebarSide?: SidebarSide;
  }
>(
  (
    {
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
      mobilePane: mobilePaneProp,
      onMobilePaneChange: setMobilePaneProp,
      shortcutSidebarSide = "left",
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const isMobile = useIsMobile();
    const [internalMobilePane, setInternalMobilePane] =
      React.useState<MobileSidebarPane>("main");
    const [internalLeftDesktopOpen, setInternalLeftDesktopOpen] =
      React.useState(defaultOpen);
    const [internalRightDesktopOpen, setInternalRightDesktopOpen] =
      React.useState(defaultRightOpen);
    const [internalLeftDesktopWidthPx, setInternalLeftDesktopWidthPx] =
      React.useState(defaultLeftDesktopWidthPx);
    const [internalRightDesktopWidthPx, setInternalRightDesktopWidthPx] =
      React.useState(defaultRightDesktopWidthPx);
    const [internalLeftMobileWidthPx, setInternalLeftMobileWidthPx] =
      React.useState(defaultLeftMobileWidthPx);
    const [internalRightMobileWidthPx, setInternalRightMobileWidthPx] =
      React.useState(defaultRightMobileWidthPx);
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
    const leftMobileWidthPx =
      leftMobileWidthPxProp ?? internalLeftMobileWidthPx;
    const rightMobileWidthPx =
      rightMobileWidthPxProp ?? internalRightMobileWidthPx;
    const mobilePane = mobilePaneProp ?? internalMobilePane;

    const setLeftDesktopOpen = React.useCallback(
      (value: React.SetStateAction<boolean>) => {
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

    const setRightDesktopOpen = React.useCallback(
      (value: React.SetStateAction<boolean>) => {
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

    const setLeftDesktopWidthPx = React.useCallback(
      (value: React.SetStateAction<number>) => {
        const nextValue = resolveNextState(leftDesktopWidthPx, value);
        if (setLeftDesktopWidthPxProp) {
          setLeftDesktopWidthPxProp(nextValue);
          return;
        }
        setInternalLeftDesktopWidthPx(nextValue);
      },
      [leftDesktopWidthPx, setLeftDesktopWidthPxProp],
    );

    const setRightDesktopWidthPx = React.useCallback(
      (value: React.SetStateAction<number>) => {
        const nextValue = resolveNextState(rightDesktopWidthPx, value);
        if (setRightDesktopWidthPxProp) {
          setRightDesktopWidthPxProp(nextValue);
          return;
        }
        setInternalRightDesktopWidthPx(nextValue);
      },
      [rightDesktopWidthPx, setRightDesktopWidthPxProp],
    );

    const setLeftMobileWidthPx = React.useCallback(
      (value: React.SetStateAction<number>) => {
        const nextValue = resolveNextState(leftMobileWidthPx, value);
        if (setLeftMobileWidthPxProp) {
          setLeftMobileWidthPxProp(nextValue);
          return;
        }
        setInternalLeftMobileWidthPx(nextValue);
      },
      [leftMobileWidthPx, setLeftMobileWidthPxProp],
    );

    const setRightMobileWidthPx = React.useCallback(
      (value: React.SetStateAction<number>) => {
        const nextValue = resolveNextState(rightMobileWidthPx, value);
        if (setRightMobileWidthPxProp) {
          setRightMobileWidthPxProp(nextValue);
          return;
        }
        setInternalRightMobileWidthPx(nextValue);
      },
      [rightMobileWidthPx, setRightMobileWidthPxProp],
    );

    const setMobilePane = React.useCallback(
      (value: React.SetStateAction<MobileSidebarPane>) => {
        const nextValue = resolveNextState(mobilePane, value);
        if (setMobilePaneProp) {
          setMobilePaneProp(nextValue);
          return;
        }
        setInternalMobilePane(nextValue);
      },
      [mobilePane, setMobilePaneProp],
    );

    const toggleLeftSidebar = React.useCallback(() => {
      if (isMobile) {
        setMobilePane((currentPane) =>
          currentPane === "left" ? "main" : "left",
        );
        return;
      }

      setLeftDesktopOpen((currentOpen) => !currentOpen);
    }, [isMobile, setLeftDesktopOpen, setMobilePane]);

    const toggleRightSidebar = React.useCallback(() => {
      if (isMobile) {
        setMobilePane((currentPane) =>
          currentPane === "right" ? "main" : "right",
        );
        return;
      }

      setRightDesktopOpen((currentOpen) => !currentOpen);
    }, [isMobile, setMobilePane, setRightDesktopOpen]);

    React.useEffect(() => {
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
      shortcutSidebarSide === "right"
        ? setRightDesktopOpen
        : setLeftDesktopOpen;
    const togglePrimarySidebar =
      shortcutSidebarSide === "right" ? toggleRightSidebar : toggleLeftSidebar;

    const contextValue = React.useMemo<SidebarContextProps>(
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

    const sidebarWrapperStyle: React.CSSProperties & {
      "--sidebar-width": string;
      "--sidebar-width-icon": string;
    } = {
      "--sidebar-width": SIDEBAR_WIDTH,
      "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
      ...style,
    };

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          style={sidebarWrapperStyle}
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full",
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  },
);
SidebarProvider.displayName = "SidebarProvider";

export const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button> & {
    side?: SidebarSide;
  }
>(({ className, onClick, side = "left", ...props }, ref) => {
  const { toggleLeftSidebar, toggleRightSidebar } = useSidebar();
  const toggleSidebar =
    side === "right" ? toggleRightSidebar : toggleLeftSidebar;
  const label =
    side === "right" ? "Toggle Right Sidebar" : "Toggle Left Sidebar";

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      data-side={side}
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      aria-label={props["aria-label"] ?? label}
      title={props.title ?? label}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft className={cn(side === "right" ? "rotate-180" : "")} />
      <span className="sr-only">{label}</span>
    </Button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";
