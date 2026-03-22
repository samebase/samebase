import { type CSSProperties, type ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/sidebar";

export function DashboardWorkspaceFrame({
  sidebarContent,
  headerTitle,
  headerSubtitle,
  children,
  dataTestId,
}: {
  sidebarContent: ReactNode;
  headerTitle: ReactNode;
  headerSubtitle?: ReactNode;
  children: ReactNode;
  dataTestId?: string;
}) {
  const sidebarStyle: CSSProperties & {
    "--sidebar-width": string;
  } = {
    "--sidebar-width": "18rem",
  };

  return (
    <SidebarProvider
      className="h-full min-h-0"
      defaultOpen
      style={sidebarStyle}
    >
      <div data-testid={dataTestId} className="flex h-full w-full">
        <Sidebar variant="sidebar" className="border-r border-border/50">
          <SidebarContent className="gap-0 p-0">
            {sidebarContent}
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="min-w-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-border/50 px-3 py-2 sm:px-4">
              <div className="mx-auto flex w-full max-w-7xl items-center gap-2">
                <SidebarTrigger className="h-7 w-7" />
                <div className="flex min-w-0 items-baseline gap-2">
                  <h1 className="truncate text-sm font-medium">
                    {headerTitle}
                  </h1>
                  {headerSubtitle ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {headerSubtitle}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
              <div className="mx-auto w-full max-w-7xl">{children}</div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
