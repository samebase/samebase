import * as React from "react";
import {
  Sidebar as BaseSidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider as BaseSidebarProvider,
} from "@/components/ui/sidebar";
import { ForcedMobileSidebarProvider } from "@/components/ForcedMobileSidebarProvider";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";
import { PanelLeft } from "lucide-react";

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof BaseSidebarProvider> & {
    forceMobile?: boolean;
  }
>(({ children, forceMobile, ...props }, ref) => {
  return (
    <ForcedMobileSidebarProvider forceMobile={forceMobile}>
      <BaseSidebarProvider ref={ref} {...props}>
        {children}
      </BaseSidebarProvider>
    </ForcedMobileSidebarProvider>
  );
});
SidebarProvider.displayName = "SidebarProvider";

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";

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
    const usesMobileViewportSidebar =
      isMobile && side === "left" && collapsible !== "none";
    const drawerRef = React.useRef<HTMLDivElement | null>(null);
    const previousFocusedElementRef = React.useRef<HTMLElement | null>(null);

    React.useEffect(() => {
      if (!usesMobileViewportSidebar) {
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
    }, [openMobile, setOpenMobile, usesMobileViewportSidebar]);

    if (!usesMobileViewportSidebar) {
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

    return (
      <div
        ref={(node) => {
          drawerRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        tabIndex={-1}
        data-mobile="true"
        data-sidebar="sidebar"
        aria-hidden={!openMobile}
        className={cn(
          "flex h-full w-full flex-col border-r border-border/50 bg-sidebar p-0 text-sidebar-foreground outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex h-full min-w-0 flex-col">{children}</div>
      </div>
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
