import * as React from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const MOBILE_SCROLL_SETTLE_DELAY_MS = 140;

type WorkspaceSidebarShellProps = {
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
  bodyTestId?: string;
  children: React.ReactNode;
  dataTestId?: string;
  headerContent: React.ReactNode;
  headerTestId?: string;
  sidebarContent?: React.ReactNode;
  sidebarContentTestId?: string;
  sidebarHeader?: React.ReactNode;
  sidebarHeaderTestId?: string;
};

/**
 * Renders one workspace shell for both desktop and mobile. Desktop pins the
 * left column in place; mobile lets the same track pan horizontally and settle
 * between closed and open positions.
 */
export function WorkspaceSidebarShell({
  bodyClassName,
  bodyStyle,
  bodyTestId,
  children,
  dataTestId,
  headerContent,
  headerTestId,
  sidebarContent,
  sidebarContentTestId,
  sidebarHeader,
  sidebarHeaderTestId,
}: WorkspaceSidebarShellProps) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  const hasSidebarHeader =
    sidebarHeader !== undefined && sidebarHeader !== null;
  const hasSidebarContent =
    sidebarContent !== undefined && sidebarContent !== null;
  const hasSidebar = hasSidebarHeader || hasSidebarContent;
  const mobileScrollRef = React.useRef<HTMLDivElement | null>(null);
  const mobileSidebarMeasureRef = React.useRef<HTMLDivElement | null>(null);
  const [mobileSidebarWidthPx, setMobileSidebarWidthPx] = React.useState(0);
  const hasInitializedMobileScrollRef = React.useRef(false);
  const skipNextMobileScrollSyncRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!isMobile || !hasSidebar) {
      setMobileSidebarWidthPx(0);
      return;
    }

    const measuredNode = mobileSidebarMeasureRef.current;
    if (!measuredNode) {
      return;
    }

    const updateSidebarWidth = () => {
      setMobileSidebarWidthPx(
        Math.max(0, Math.round(measuredNode.getBoundingClientRect().width)),
      );
    };

    updateSidebarWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSidebarWidth);
      return () => window.removeEventListener("resize", updateSidebarWidth);
    }

    const resizeObserver = new ResizeObserver(updateSidebarWidth);
    resizeObserver.observe(measuredNode);
    window.addEventListener("resize", updateSidebarWidth);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSidebarWidth);
    };
  }, [hasSidebar, isMobile]);

  React.useEffect(() => {
    if (!isMobile || !hasSidebar || mobileSidebarWidthPx === 0) {
      hasInitializedMobileScrollRef.current = false;
      skipNextMobileScrollSyncRef.current = false;
      return;
    }

    const scrollNode = mobileScrollRef.current;
    if (!scrollNode) {
      return;
    }

    const targetScrollLeft = openMobile ? 0 : mobileSidebarWidthPx;
    if (!hasInitializedMobileScrollRef.current) {
      scrollNode.scrollLeft = targetScrollLeft;
      hasInitializedMobileScrollRef.current = true;
      return;
    }

    if (skipNextMobileScrollSyncRef.current) {
      skipNextMobileScrollSyncRef.current = false;
      return;
    }

    if (Math.abs(scrollNode.scrollLeft - targetScrollLeft) <= 1) {
      return;
    }

    scrollNode.scrollTo({
      left: targetScrollLeft,
      behavior: "smooth",
    });
  }, [hasSidebar, isMobile, mobileSidebarWidthPx, openMobile]);

  React.useEffect(() => {
    if (!isMobile || !hasSidebar || mobileSidebarWidthPx === 0) {
      return;
    }

    const scrollNode = mobileScrollRef.current;
    if (!scrollNode) {
      return;
    }

    const settleScrollPosition = () => {
      const nextOpenMobile = scrollNode.scrollLeft < mobileSidebarWidthPx / 2;

      if (nextOpenMobile !== openMobile) {
        skipNextMobileScrollSyncRef.current = true;
        setOpenMobile(nextOpenMobile);
      }
    };

    let settleTimeoutId: number | null = null;
    const handleScroll = () => {
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }

      settleTimeoutId = window.setTimeout(
        settleScrollPosition,
        MOBILE_SCROLL_SETTLE_DELAY_MS,
      );
    };

    scrollNode.addEventListener("scroll", handleScroll, { passive: true });
    scrollNode.addEventListener("scrollend", settleScrollPosition);
    return () => {
      scrollNode.removeEventListener("scroll", handleScroll);
      scrollNode.removeEventListener("scrollend", settleScrollPosition);
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [hasSidebar, isMobile, mobileSidebarWidthPx, openMobile, setOpenMobile]);

  const handleMainViewClickCapture = React.useCallback(() => {
    if (!isMobile || !openMobile) {
      return;
    }

    setOpenMobile(false);
  }, [isMobile, openMobile, setOpenMobile]);

  const shellStyle: React.CSSProperties & {
    "--workspace-sidebar-width"?: string;
  } = {
    // Keep one shared shell tree everywhere. Mobile pans across the full track;
    // desktop keeps the track fixed and collapses just the left column.
    gridTemplateColumns: hasSidebar
      ? isMobile
        ? "var(--workspace-sidebar-width) minmax(0, 1fr)"
        : `${open ? "var(--workspace-sidebar-width)" : "0px"} minmax(0, 1fr)`
      : "0 minmax(0, 1fr)",
    gridTemplateRows: "auto minmax(0, 1fr)",
    width:
      isMobile && hasSidebar
        ? "calc(100% + var(--workspace-sidebar-width))"
        : "100%",
    "--workspace-sidebar-width": "var(--sidebar-width)",
  };

  const sidebarCellClassName = cn(
    "min-w-0 overflow-hidden transition-[border-color] duration-200 ease-linear",
    isMobile || open
      ? "border-r border-border/50"
      : "pointer-events-none border-r border-transparent",
  );

  return (
    <div
      ref={isMobile ? mobileScrollRef : undefined}
      data-testid={dataTestId}
      data-sidebar-shell={isMobile ? "mobile" : "desktop"}
      className={cn(
        "h-full w-full min-h-0",
        isMobile
          ? "overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "overflow-hidden",
      )}
    >
      <div
        data-sidebar-track={isMobile ? "pannable" : "static"}
        className={cn(
          "grid h-full min-h-0",
          isMobile
            ? "snap-x snap-mandatory"
            : "transition-[grid-template-columns] duration-200 ease-linear",
        )}
        style={shellStyle}
      >
        {hasSidebarHeader ? (
          <div
            data-testid={sidebarHeaderTestId}
            aria-hidden={isMobile ? undefined : !open}
            className={cn(sidebarCellClassName, isMobile ? "snap-start" : "")}
          >
            <div
              ref={!hasSidebarContent ? mobileSidebarMeasureRef : undefined}
              className="min-w-0 overflow-hidden"
              style={{ width: "var(--workspace-sidebar-width)" }}
            >
              {sidebarHeader}
            </div>
          </div>
        ) : null}

        {hasSidebarContent ? (
          <div
            data-testid={sidebarContentTestId}
            aria-hidden={isMobile ? undefined : !open}
            className={cn(
              sidebarCellClassName,
              hasSidebarHeader ? "row-start-2 min-h-0" : "row-span-2 min-h-0",
              isMobile ? "snap-start" : "",
            )}
          >
            <div
              ref={mobileSidebarMeasureRef}
              className="flex h-full min-h-0 flex-col overflow-hidden"
              style={{ width: "var(--workspace-sidebar-width)" }}
            >
              {sidebarContent}
            </div>
          </div>
        ) : null}

        <div
          data-testid={headerTestId}
          onClickCapture={handleMainViewClickCapture}
          className={cn(
            "col-start-2 row-start-1 min-w-0 border-b border-border/50",
            isMobile ? "snap-start" : "",
          )}
        >
          {headerContent}
        </div>

        <div
          data-testid={bodyTestId}
          onClickCapture={handleMainViewClickCapture}
          className={cn(
            "col-start-2 row-start-2 min-h-0 min-w-0",
            bodyClassName,
            isMobile ? "snap-start" : "",
          )}
          style={bodyStyle}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
