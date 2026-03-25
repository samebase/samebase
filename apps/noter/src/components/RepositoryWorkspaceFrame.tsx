import { type ReactNode } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarTrigger } from "@/components/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

export function RepositoryWorkspaceFrame({
  sidebarHeader,
  sidebarContent,
  headerTitle,
  headerRight,
  onQuickOpen,
  children,
  dataTestId,
  headerTestId,
  contentClassName,
}: {
  sidebarHeader?: ReactNode;
  sidebarContent: ReactNode;
  headerTitle?: ReactNode;
  headerRight?: ReactNode;
  onQuickOpen?: () => void;
  children: ReactNode;
  dataTestId?: string;
  headerTestId?: string;
  contentClassName?: string;
}) {
  const { isMobile, open } = useSidebar();
  const hasSidebarHeader =
    sidebarHeader !== undefined && sidebarHeader !== null;

  if (isMobile) {
    return (
      <div data-testid={dataTestId} className="flex h-full w-full">
        <Sidebar variant="sidebar" className="border-r border-border/50">
          {hasSidebarHeader ? sidebarHeader : null}
          <SidebarContent className="p-0">{sidebarContent}</SidebarContent>
        </Sidebar>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div
            data-testid={headerTestId}
            className="flex items-center justify-between border-b border-border/50 p-3"
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8 md:h-6 md:w-6" />
              {onQuickOpen ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 md:h-6 md:w-6"
                  onClick={onQuickOpen}
                  title="Quick Open (Cmd+P)"
                  aria-label="Quick Open"
                >
                  <MagnifyingGlassIcon className="h-4 w-4 md:h-3 md:w-3" />
                </Button>
              ) : null}
              {headerTitle ? (
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-medium md:text-sm">
                    {headerTitle}
                  </span>
                </div>
              ) : null}
            </div>

            {headerRight}
          </div>

          <div
            className={cn(
              "min-h-0 flex-1",
              contentClassName ?? "overflow-auto p-4",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={dataTestId}
      className="grid h-full w-full min-h-0 transition-[grid-template-columns] duration-200 ease-linear"
      style={{
        gridTemplateColumns: open
          ? "var(--sidebar-width) minmax(0, 1fr)"
          : "0 minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr)",
      }}
    >
      {open && hasSidebarHeader ? (
        <div className="min-w-0 overflow-hidden border-r border-border/50">
          {sidebarHeader}
        </div>
      ) : null}

      {open ? (
        <div
          className={cn(
            "min-h-0 min-w-0 overflow-hidden border-r border-border/50",
            hasSidebarHeader ? "row-start-2" : "row-span-2 row-start-1",
          )}
        >
          <div className="flex h-full min-h-0 flex-col">{sidebarContent}</div>
        </div>
      ) : null}

      <div
        data-testid={headerTestId}
        className="col-start-2 row-start-1 flex items-center justify-between border-b border-border/50 p-3"
      >
        <div className="flex items-center gap-3">
          <SidebarTrigger className="h-8 w-8 md:h-6 md:w-6" />
          {onQuickOpen ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 md:h-6 md:w-6"
              onClick={onQuickOpen}
              title="Quick Open (Cmd+P)"
              aria-label="Quick Open"
            >
              <MagnifyingGlassIcon className="h-4 w-4 md:h-3 md:w-3" />
            </Button>
          ) : null}
          {headerTitle ? (
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-medium md:text-sm">
                {headerTitle}
              </span>
            </div>
          ) : null}
        </div>

        {headerRight}
      </div>

      <div
        className={cn(
          "col-start-2 row-start-2 min-h-0 min-w-0",
          contentClassName ?? "overflow-auto p-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}
