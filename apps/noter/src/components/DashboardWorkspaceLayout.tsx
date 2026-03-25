import { type CSSProperties, type ReactNode } from "react";
import { Sidebar, SidebarContent } from "@/components/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

export function DashboardWorkspaceLayout({
  sidebarHeader,
  sidebarContent,
  topBarContent,
  pageHeaderContent,
  children,
  dataTestId,
  bodyClassName,
  bodyStyle,
}: {
  sidebarHeader?: ReactNode;
  sidebarContent?: ReactNode;
  topBarContent: ReactNode;
  pageHeaderContent?: ReactNode;
  children: ReactNode;
  dataTestId?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}) {
  const { isMobile, open } = useSidebar();
  const hasSidebarHeader =
    sidebarHeader !== undefined && sidebarHeader !== null;
  const hasSidebarContent =
    sidebarContent !== undefined && sidebarContent !== null;
  const hasPageHeader =
    pageHeaderContent !== undefined && pageHeaderContent !== null;

  if (isMobile) {
    return (
      <div data-testid={dataTestId} className="flex h-full w-full">
        {hasSidebarHeader || hasSidebarContent ? (
          <Sidebar variant="sidebar" className="border-r border-border/50">
            {hasSidebarHeader ? sidebarHeader : null}
            {hasSidebarContent ? (
              <SidebarContent className="gap-0 p-0">
                {sidebarContent}
              </SidebarContent>
            ) : null}
          </Sidebar>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div className="border-b border-border/50">{topBarContent}</div>
          {hasPageHeader ? (
            <div className="border-b border-border/50">{pageHeaderContent}</div>
          ) : null}
          <div
            className={cn("min-h-0 flex-1", bodyClassName)}
            style={bodyStyle}
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
        gridTemplateColumns:
          open && (hasSidebarHeader || hasSidebarContent)
            ? "var(--sidebar-width) minmax(0, 1fr)"
            : "0 minmax(0, 1fr)",
        gridTemplateRows: hasPageHeader
          ? "auto auto minmax(0, 1fr)"
          : "auto minmax(0, 1fr)",
      }}
    >
      {open && hasSidebarHeader ? (
        <div className="min-w-0 overflow-hidden border-r border-border/50">
          {sidebarHeader}
        </div>
      ) : null}

      {open && hasSidebarContent ? (
        <div
          className="min-h-0 min-w-0 overflow-hidden border-r border-border/50"
          style={{
            gridColumn: 1,
            gridRow: hasPageHeader ? "2 / 4" : "2 / 3",
          }}
        >
          <div className="flex h-full min-h-0 flex-col">{sidebarContent}</div>
        </div>
      ) : null}

      <div className="col-start-2 row-start-1 min-w-0 border-b border-border/50">
        {topBarContent}
      </div>

      {hasPageHeader ? (
        <div className="col-start-2 row-start-2 min-w-0 border-b border-border/50">
          {pageHeaderContent}
        </div>
      ) : null}

      <div
        className={cn(
          "col-start-2 min-h-0 min-w-0",
          hasPageHeader ? "row-start-3" : "row-start-2",
          bodyClassName,
        )}
        style={bodyStyle}
      >
        {children}
      </div>
    </div>
  );
}
