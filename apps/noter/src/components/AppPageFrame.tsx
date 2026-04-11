import { type ReactNode } from "react";
import { WorkspaceLayoutV2TopBar } from "./workspace-layout-v2/WorkspaceLayoutV2TopBar";

/**
 * Keep one normal page shell across the app so the browser owns page scroll
 * and route surfaces can opt into local containment only where they need it.
 * // TODO: move in wp-layout-v2
 */
export function AppPageFrame({
  children,
  dataTestId,
  topBar,
}: {
  children: ReactNode;
  dataTestId?: string;
  topBar?: ReactNode;
}) {
  return (
    <div
      data-testid={dataTestId}
      className="flex min-h-svh w-full flex-col bg-background"
    >
      <WorkspaceLayoutV2TopBar>{topBar}</WorkspaceLayoutV2TopBar>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
