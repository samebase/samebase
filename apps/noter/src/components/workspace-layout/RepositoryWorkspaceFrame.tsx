import { type ReactNode } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { WorkspaceRouteFrame } from "@/components/workspace-layout/WorkspaceRouteFrame";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/sidebar";
import { cn } from "@/lib/utils";

type SidebarSlot = Exclude<ReactNode, undefined>;

export function RepositoryWorkspaceFrame({
  leftSidebarHeader,
  leftSidebarContent,
  rightSidebarHeader,
  rightSidebarContent,
  headerTitle,
  headerRight,
  onQuickOpen,
  children,
  dataTestId,
  headerTestId,
  contentClassName,
}: {
  leftSidebarHeader: SidebarSlot;
  leftSidebarContent: SidebarSlot;
  rightSidebarHeader: SidebarSlot;
  rightSidebarContent: SidebarSlot;
  headerTitle?: ReactNode;
  headerRight?: ReactNode;
  onQuickOpen?: () => void;
  children: ReactNode;
  dataTestId?: string;
  headerTestId?: string;
  contentClassName?: string;
}) {
  const hasLeftSidebar =
    leftSidebarHeader !== null || leftSidebarContent !== null;
  const hasRightSidebar =
    rightSidebarHeader !== null || rightSidebarContent !== null;

  return (
    <WorkspaceRouteFrame
      dataTestId={dataTestId}
      headerTestId={headerTestId}
      leftSidebarHeader={leftSidebarHeader}
      leftSidebarContent={leftSidebarContent}
      rightSidebarHeader={rightSidebarHeader}
      rightSidebarContent={rightSidebarContent}
      headerContent={
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            {hasLeftSidebar ? (
              <SidebarTrigger
                className="sr-only h-8 w-8 md:not-sr-only md:inline-flex md:h-6 md:w-6"
                side="left"
              />
            ) : null}
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

          <div className="flex items-center gap-2">
            {headerRight}
            {hasRightSidebar ? (
              <SidebarTrigger
                className="sr-only h-8 w-8 md:not-sr-only md:inline-flex md:h-6 md:w-6"
                side="right"
              />
            ) : null}
          </div>
        </div>
      }
      bodyClassName={cn("min-h-0", contentClassName ?? "overflow-auto p-4")}
    >
      {children}
    </WorkspaceRouteFrame>
  );
}
