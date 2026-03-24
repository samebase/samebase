import { type ReactNode } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarTrigger,
} from "@/components/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";

export function RepositoryWorkspaceFrame({
  sidebarHeader,
  sidebarContent,
  headerTitle,
  headerRight,
  contentHeader,
  onQuickOpen,
  children,
  dataTestId,
  contentClassName,
}: {
  sidebarHeader?: ReactNode;
  sidebarContent: ReactNode;
  headerTitle?: ReactNode;
  headerRight?: ReactNode;
  contentHeader?: ReactNode;
  onQuickOpen?: () => void;
  children: ReactNode;
  dataTestId?: string;
  contentClassName?: string;
}) {
  const { isMobile, open } = useSidebar();
  const hasSidebarHeader =
    sidebarHeader !== undefined && sidebarHeader !== null;
  const hasSidebarContent =
    sidebarContent !== undefined && sidebarContent !== null;
  const hasSidebar = hasSidebarHeader || hasSidebarContent;
  const hasContentHeader =
    contentHeader !== undefined && contentHeader !== null;
  const desktopSidebarRowEnd = hasContentHeader ? 4 : 3;
  const resolvedContentClassName = cn(
    "min-h-0 min-w-0",
    contentClassName ?? "overflow-auto p-4",
  );

  const pageHeader = (
    <div className="flex items-center justify-between border-b border-border/50 p-3">
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
  );

  return (
    <div data-testid={dataTestId} className="flex h-full w-full">
      {hasSidebar && isMobile ? (
        <Sidebar variant="sidebar" className="border-r border-border/50">
          {hasSidebarHeader ? sidebarHeader : null}
          {hasSidebarContent ? (
            <SidebarContent className="gap-0 p-0">
              {sidebarContent}
            </SidebarContent>
          ) : null}
        </Sidebar>
      ) : null}

      <SidebarInset className="flex-1 min-w-0">
        {isMobile ? (
          <div className="flex h-full min-h-0 flex-col">
            {pageHeader}
            {hasContentHeader ? (
              <div className="border-b border-border/50">{contentHeader}</div>
            ) : null}
            <div className={cn("flex-1", resolvedContentClassName)}>
              {children}
            </div>
          </div>
        ) : (
          <div
            className="grid h-full min-h-0 transition-[grid-template-columns] duration-200 ease-linear"
            style={{
              gridTemplateColumns:
                hasSidebar && open
                  ? "var(--sidebar-width) minmax(0, 1fr)"
                  : "0 minmax(0, 1fr)",
              gridTemplateRows: hasContentHeader
                ? "auto auto minmax(0, 1fr)"
                : "auto minmax(0, 1fr)",
            }}
          >
            {hasSidebar && open && hasSidebarHeader ? (
              <div className="min-w-0 overflow-hidden border-r border-border/50">
                {sidebarHeader}
              </div>
            ) : null}

            {hasSidebar && open && hasSidebarContent ? (
              <div
                className="min-h-0 min-w-0 overflow-hidden border-r border-border/50"
                style={{
                  gridColumn: 1,
                  gridRow: `${hasSidebarHeader ? 2 : 1} / ${desktopSidebarRowEnd}`,
                }}
              >
                <div className="flex h-full min-h-0 flex-col">
                  {sidebarContent}
                </div>
              </div>
            ) : null}

            <div className="col-start-2 row-start-1 min-w-0">{pageHeader}</div>

            {hasContentHeader ? (
              <div className="col-start-2 row-start-2 min-w-0 border-b border-border/50">
                {contentHeader}
              </div>
            ) : null}

            <div
              className={cn(
                "col-start-2",
                hasContentHeader ? "row-start-3" : "row-start-2",
                resolvedContentClassName,
              )}
            >
              {children}
            </div>
          </div>
        )}
      </SidebarInset>
    </div>
  );
}
