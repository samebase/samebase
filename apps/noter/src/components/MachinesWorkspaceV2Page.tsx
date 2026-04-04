import { PersistedSidebarProvider } from "@/components/PersistedSidebarProvider";
import { WorkspaceLayoutV2 } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { useWorkspaceLayoutV2DragSurface } from "@/components/workspace-layout-v2/useWorkspaceLayoutV2DragSurface";
import { cn } from "@/lib/utils";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

const MACHINES_WORKSPACE_V2_DEFAULT_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 304,
  leftMobileWidthPx: 304,
  mobilePane: "main",
  rightDesktopOpen: false,
  rightDesktopWidthPx: 320,
  rightMobileWidthPx: 320,
} satisfies WorkspaceSidebarState;

/**
 * This route is intentionally content-light. Its job is to exercise the shared
 * shell on a real route before we wire actual machines content into it.
 */
function PlaceholderPane(props: {
  body: string;
  eyebrow: string;
  title: string;
  tone: "main" | "sidebar";
}) {
  const dragSurface = useWorkspaceLayoutV2DragSurface(true);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        props.tone === "main" ? "bg-background" : "bg-muted/10",
      )}
    >
      <div className="border-b px-4 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {props.eyebrow}
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">
          {props.title}
        </h1>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        style={{ touchAction: dragSurface.touchAction }}
        {...dragSurface.containerProps}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{props.body}</p>
          </div>
          <div className="rounded-xl border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              Mobile proofing notes:
            </p>
            <p className="mt-2 text-sm text-foreground">
              Swipe horizontally from the visible surface. Desktop keeps the
              edge buttons; mobile is drag-only. Both sidebars stay mounted even
              when they are just placeholders.
            </p>
          </div>
          {Array.from({ length: 10 }, (_, index) => (
            <div
              key={index}
              className="rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground"
            >
              Placeholder block {index + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MachinesWorkspaceV2Page() {
  return (
    <PersistedSidebarProvider
      className="h-full min-h-0"
      // Persist widths and the active mobile pane so the route behaves like a
      // real workspace instead of a reset-on-refresh demo.
      defaultState={MACHINES_WORKSPACE_V2_DEFAULT_STATE}
      workspaceKey="machinesV2"
    >
      <WorkspaceLayoutV2
        dataTestId="machines-workspace-v2-route"
        left={
          <PlaceholderPane
            body="Shared shell v2 placeholder for the left sidebar slot."
            eyebrow="/v2/machines"
            title="Left Sidebar"
            tone="sidebar"
          />
        }
        main={
          <PlaceholderPane
            body="Shared shell v2 placeholder for the main pane. This route exists to validate shell feel before wiring real route content."
            eyebrow="Shared Shell V2"
            title="Main Pane"
            tone="main"
          />
        }
        right={
          <PlaceholderPane
            body="Shared shell v2 placeholder for the right sidebar slot."
            eyebrow="/v2/machines"
            title="Right Sidebar"
            tone="sidebar"
          />
        }
      />
    </PersistedSidebarProvider>
  );
}
