import { type ReactNode } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { WorkspaceRouteFrame } from "@/components/workspace-layout/WorkspaceRouteFrame";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/sidebar";
import { cn } from "@/lib/utils";
import { WorkspaceLayoutV2FullPage } from "../workspace-layout-v2/WorkspaceLayoutV2";

type SidebarSlot = Exclude<ReactNode, undefined>;

function renderDefaultEmptySidebarContent() {
  return <div aria-hidden="true" className="min-h-0 flex-1 bg-background" />;
}

export function RepositoryWorkspaceFrame({
  leftSidebarHeader,
  leftSidebarContent,
  rightSidebarHeader,
  rightSidebarContent,
  headerMiddle,
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
  headerMiddle?: ReactNode;
  headerTitle?: ReactNode;
  headerRight?: ReactNode;
  onQuickOpen?: () => void;
  children: ReactNode;
  dataTestId?: string;
  headerTestId?: string;
  contentClassName?: string;
}) {
  // `null` means "show the standard empty sidebar surface" so routes keep the
  // shared chrome and trigger behavior even before they have real pane content.
  const resolvedLeftSidebarContent =
    leftSidebarContent ?? renderDefaultEmptySidebarContent();
  const resolvedRightSidebarContent =
    rightSidebarContent ?? renderDefaultEmptySidebarContent();

  return (
    <WorkspaceRouteFrame
      dataTestId={dataTestId}
      headerTestId={headerTestId}
      leftSidebarHeader={leftSidebarHeader}
      leftSidebarContent={resolvedLeftSidebarContent}
      rightSidebarHeader={rightSidebarHeader}
      rightSidebarContent={resolvedRightSidebarContent}
      headerContent={
        <div className="flex items-start gap-3 p-3 sm:items-center">
          <div className="flex shrink-0 items-center gap-3 pt-0.5 sm:pt-0">
            <SidebarTrigger
              className="sr-only h-8 w-8 md:not-sr-only md:inline-flex md:h-6 md:w-6"
              side="left"
            />
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
          </div>

          <div className="min-w-0 flex-1 overflow-hidden pt-0.5 sm:pt-0">
            {headerMiddle ??
              (headerTitle ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-base font-medium md:text-sm">
                    {headerTitle}
                  </span>
                </div>
              ) : null)}
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5 sm:pt-0">
            {headerRight}
            {/* Keep the right trigger visible so empty panes still match the shared workspace shell. */}
            <SidebarTrigger
              className="sr-only h-8 w-8 md:not-sr-only md:inline-flex md:h-6 md:w-6"
              side="right"
            />
          </div>
        </div>
      }
      bodyClassName={cn("min-h-0", contentClassName ?? "overflow-auto p-4")}
    >
      {children}
    </WorkspaceRouteFrame>
  );
}
