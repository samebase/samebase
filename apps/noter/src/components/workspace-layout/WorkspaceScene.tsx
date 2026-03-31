import { type CSSProperties, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export type WorkspaceBottomDockRenderProps = {
  onMobileDockInsetChange: (dockInset: string | undefined) => void;
};

/**
 * Shared route scene that keeps one scroll container plus an optional bottom
 * dock/overlay. When the dock reports a mobile inset, the scroll surface gains
 * matching padding so fixed bottom UI does not obscure content underneath it.
 */
export function WorkspaceScene({
  workspaceBody,
  workspacePaneClassName,
  workspaceScrollClassName,
  workspaceScrollStyle,
  overlayContent,
  bottomDock,
}: {
  workspaceBody: ReactNode;
  workspacePaneClassName?: string;
  workspaceScrollClassName?: string;
  workspaceScrollStyle?: CSSProperties;
  overlayContent?: ReactNode;
  bottomDock?: (props: WorkspaceBottomDockRenderProps) => ReactNode;
}) {
  const [mobileBottomDockInset, setMobileBottomDockInset] = useState<
    string | undefined
  >(undefined);

  const mergedWorkspaceScrollStyle: CSSProperties | undefined =
    mobileBottomDockInset
      ? {
          ...workspaceScrollStyle,
          // Keep the fixed mobile dock from obscuring the scrollable surface
          // underneath it while preserving any route-provided scroll styles.
          paddingBottom: mobileBottomDockInset,
          scrollPaddingBottom: mobileBottomDockInset,
        }
      : workspaceScrollStyle;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col",
        workspacePaneClassName,
      )}
    >
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          workspaceScrollClassName,
        )}
        style={mergedWorkspaceScrollStyle}
      >
        {workspaceBody}
      </div>
      {bottomDock?.({
        onMobileDockInsetChange: setMobileBottomDockInset,
      })}
      {overlayContent}
    </div>
  );
}
