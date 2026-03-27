import * as React from "react";
import {
  Sidebar as BaseSidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useMobileSidebarDrag } from "@/hooks/use-mobile-sidebar-drag";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

const Sidebar = React.forwardRef<
  React.ElementRef<typeof BaseSidebar>,
  React.ComponentProps<typeof BaseSidebar>
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const { isMobile, openMobile, setOpenMobile } = useSidebar();
    const usesMobileDrawer =
      isMobile && side === "left" && collapsible !== "none";
    const drawerRef = React.useRef<HTMLDivElement | null>(null);
    const previousFocusedElementRef = React.useRef<HTMLElement | null>(null);
    const {
      closeHandleWidthPx,
      drawerStyle,
      edgeHandleWidthPx,
      isDragging,
      onCloseHandlePointerCancel,
      onCloseHandlePointerDown,
      onCloseHandlePointerMove,
      onCloseHandlePointerUp,
      onOpenHandlePointerCancel,
      onOpenHandlePointerDown,
      onOpenHandlePointerMove,
      onOpenHandlePointerUp,
      overlayOpacity,
      revealProgress,
    } = useMobileSidebarDrag({
      open: openMobile,
      onOpenChange: setOpenMobile,
    });

    React.useEffect(() => {
      if (!usesMobileDrawer) {
        return;
      }
      if (!openMobile) {
        previousFocusedElementRef.current?.focus();
        previousFocusedElementRef.current = null;
        return;
      }

      if (document.activeElement instanceof HTMLElement) {
        previousFocusedElementRef.current = document.activeElement;
      }
      drawerRef.current?.focus();

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpenMobile(false);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [openMobile, setOpenMobile, usesMobileDrawer]);

    if (!usesMobileDrawer) {
      return (
        <BaseSidebar
          ref={ref}
          side={side}
          variant={variant}
          collapsible={collapsible}
          className={className}
          {...props}
        >
          {children}
        </BaseSidebar>
      );
    }

    const drawerIsVisible = revealProgress > 0;

    return (
      <>
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/80 md:hidden"
          onClick={() => setOpenMobile(false)}
          style={{
            opacity: overlayOpacity,
            pointerEvents: openMobile ? "auto" : "none",
            transition: isDragging ? "none" : "opacity 200ms ease",
          }}
        />
        <div
          ref={(node) => {
            drawerRef.current = node;
            if (typeof ref === "function") {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          role="dialog"
          tabIndex={-1}
          data-mobile="true"
          data-sidebar="sidebar"
          aria-hidden={!openMobile}
          aria-modal={openMobile}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-svh flex-col border-r border-border/50 bg-sidebar p-0 text-sidebar-foreground shadow-lg outline-none md:hidden",
            className,
          )}
          style={{
            ...drawerStyle,
            pointerEvents: openMobile ? "auto" : "none",
          }}
          {...props}
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 z-10"
            onPointerCancel={onCloseHandlePointerCancel}
            onPointerDown={onCloseHandlePointerDown}
            onPointerMove={onCloseHandlePointerMove}
            onPointerUp={onCloseHandlePointerUp}
            style={{
              touchAction: "pan-y",
              width: `${closeHandleWidthPx}px`,
            }}
          />
          <div className="flex h-full w-full flex-col">{children}</div>
        </div>
        <div
          aria-hidden="true"
          className="fixed inset-y-0 left-0 z-30 md:hidden"
          onPointerCancel={onOpenHandlePointerCancel}
          onPointerDown={onOpenHandlePointerDown}
          onPointerMove={onOpenHandlePointerMove}
          onPointerUp={onOpenHandlePointerUp}
          style={{
            opacity: drawerIsVisible ? 0 : 1,
            pointerEvents: drawerIsVisible ? "none" : "auto",
            touchAction: "pan-y",
            width: `${edgeHandleWidthPx}px`,
          }}
        />
      </>
    );
  },
);
Sidebar.displayName = "Sidebar";

export {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
};
