import { type ReactNode } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export function RepositoryWorkspaceFrame({
  sidebarContent,
  headerTitle,
  headerRight,
  onQuickOpen,
  children,
  dataTestId,
}: {
  sidebarContent: ReactNode;
  headerTitle?: ReactNode;
  headerRight?: ReactNode;
  onQuickOpen?: () => void;
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <div data-testid={dataTestId} className="flex h-full w-full">
      <Sidebar variant="sidebar" className="border-r border-border/50">
        <SidebarContent className="p-0">{sidebarContent}</SidebarContent>
      </Sidebar>

      <SidebarInset className="flex-1">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border/50 p-3">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8 md:h-6 md:w-6" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 md:h-6 md:w-6"
                onClick={onQuickOpen}
                title="Quick Open (Cmd+P)"
                disabled={onQuickOpen === undefined}
              >
                <MagnifyingGlassIcon className="h-4 w-4 md:h-3 md:w-3" />
              </Button>
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

          <div className="flex-1 overflow-auto p-4">{children}</div>
        </div>
      </SidebarInset>
    </div>
  );
}
