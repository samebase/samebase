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

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
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
    defaultRightOpen?: boolean;
    rightOpen?: boolean;
    onRightOpenChange?: (open: boolean) => void;
    defaultLeftDesktopWidthPx?: number;
    defaultRightDesktopWidthPx?: number;
    defaultLeftMobileWidthPx?: number;
    defaultRightMobileWidthPx?: number;
    shortcutSidebarSide?: SidebarSide;
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      defaultRightOpen = false,
      rightOpen: rightOpenProp,
      onRightOpenChange: setRightOpenProp,
      defaultLeftDesktopWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      defaultRightDesktopWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      defaultLeftMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      defaultRightMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      shortcutSidebarSide = "left",
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const isMobile = useIsMobile();
    const [mobilePane, setMobilePane] =
      React.useState<MobileSidebarPane>("main");
    const [internalLeftDesktopOpen, setInternalLeftDesktopOpen] =
      React.useState(defaultOpen);
    const [internalRightDesktopOpen, setInternalRightDesktopOpen] =
      React.useState(defaultRightOpen);
    const [leftDesktopWidthPx, setLeftDesktopWidthPx] = React.useState(
      defaultLeftDesktopWidthPx,
    );
    const [rightDesktopWidthPx, setRightDesktopWidthPx] = React.useState(
      defaultRightDesktopWidthPx,
    );
    const [leftMobileWidthPx, setLeftMobileWidthPx] = React.useState(
      defaultLeftMobileWidthPx,
    );
    const [rightMobileWidthPx, setRightMobileWidthPx] = React.useState(
      defaultRightMobileWidthPx,
    );
    const leftDesktopOpen = openProp ?? internalLeftDesktopOpen;
    const rightDesktopOpen = rightOpenProp ?? internalRightDesktopOpen;

    const setLeftDesktopOpen = React.useCallback(
      (value: React.SetStateAction<boolean>) => {
        const nextValue = resolveNextState(leftDesktopOpen, value);
        if (setOpenProp) {
          setOpenProp(nextValue);
        } else {
          setInternalLeftDesktopOpen(nextValue);
        }

        if (shortcutSidebarSide === "left") {
          // Preserve the existing single-sidebar cookie contract while the dual
          // sidebar implementation is still intentionally light on persistence.
          document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
        }
      },
      [leftDesktopOpen, setOpenProp, shortcutSidebarSide],
    );

    const setRightDesktopOpen = React.useCallback(
      (value: React.SetStateAction<boolean>) => {
        const nextValue = resolveNextState(rightDesktopOpen, value);
        if (setRightOpenProp) {
          setRightOpenProp(nextValue);
        } else {
          setInternalRightDesktopOpen(nextValue);
        }

        if (shortcutSidebarSide === "right") {
          document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
        }
      },
      [rightDesktopOpen, setRightOpenProp, shortcutSidebarSide],
    );

    const toggleLeftSidebar = React.useCallback(() => {
      if (isMobile) {
        setMobilePane((currentPane) =>
          currentPane === "left" ? "main" : "left",
        );
        return;
      }

      setLeftDesktopOpen((currentOpen) => !currentOpen);
    }, [isMobile, setLeftDesktopOpen]);

    const toggleRightSidebar = React.useCallback(() => {
      if (isMobile) {
        setMobilePane((currentPane) =>
          currentPane === "right" ? "main" : "right",
        );
        return;
      }

      setRightDesktopOpen((currentOpen) => !currentOpen);
    }, [isMobile, setRightDesktopOpen]);

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
