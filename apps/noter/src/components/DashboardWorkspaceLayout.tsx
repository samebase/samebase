import { type CSSProperties, type ReactNode } from "react";
import { MobileSidebarViewport } from "@/components/MobileSidebarViewport";
import { Sidebar, SidebarContent } from "@/components/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

export function DashboardWorkspaceLayout({
  sidebarHeader,
  sidebarContent,
  headerContent,
  children,
  dataTestId,
  bodyClassName,
  bodyStyle,
}: {
  sidebarHeader?: ReactNode;
  sidebarContent?: ReactNode;
  headerContent: ReactNode;
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
  const mobileSidebar =
    hasSidebarHeader || hasSidebarContent ? (
      <Sidebar variant="sidebar" className="border-r border-border/50">
        {hasSidebarHeader ? sidebarHeader : null}
        {hasSidebarContent ? (
          <SidebarContent className="gap-0 p-0">
            {sidebarContent}
          </SidebarContent>
        ) : null}
      </Sidebar>
    ) : null;

  if (isMobile) {
    return (
      <MobileSidebarViewport
        dataTestId={dataTestId}
        openDragRegion="viewport"
        sidebar={mobileSidebar}
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
          <div
            data-testid="dashboard-layout-header"
            className="border-b border-border/50"
          >
            {headerContent}
          </div>
          <div
            data-testid="dashboard-layout-body"
            className={cn("min-h-0 flex-1", bodyClassName)}
            style={bodyStyle}
          >
            {children}
          </div>
        </div>
      </MobileSidebarViewport>
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
        gridTemplateRows: "auto minmax(0, 1fr)",
      }}
    >
      {open && hasSidebarHeader ? (
        <div
          data-testid="dashboard-layout-sidebar-header"
          className="min-w-0 overflow-hidden border-r border-border/50"
        >
          {sidebarHeader}
        </div>
      ) : null}

      {open && hasSidebarContent ? (
        <div
          data-testid="dashboard-layout-sidebar-content"
          className="row-start-2 min-h-0 min-w-0 overflow-hidden border-r border-border/50"
        >
          <div className="flex h-full min-h-0 flex-col">{sidebarContent}</div>
        </div>
      ) : null}

      <div
        data-testid="dashboard-layout-header"
        className="col-start-2 row-start-1 min-w-0 border-b border-border/50"
      >
        {headerContent}
      </div>

      <div
        data-testid="dashboard-layout-body"
        className={cn("col-start-2 row-start-2 min-h-0 min-w-0", bodyClassName)}
        style={bodyStyle}
      >
        {children}
      </div>
    </div>
  );
}
