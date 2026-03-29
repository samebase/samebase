import { type ReactNode } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { WorkspaceSidebarShell } from "@/components/WorkspaceSidebarShell";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/sidebar";
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
  return (
    <WorkspaceSidebarShell
      dataTestId={dataTestId}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      headerTestId={headerTestId}
      headerContent={
        <div className="flex items-center justify-between p-3">
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
      }
      bodyClassName={cn("min-h-0", contentClassName ?? "overflow-auto p-4")}
    >
      {children}
    </WorkspaceSidebarShell>
  );
}
