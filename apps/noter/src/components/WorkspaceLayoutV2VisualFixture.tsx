import { SidebarProvider } from "@/components/sidebar";
import { WorkspaceLayoutV2 } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";

export function WorkspaceLayoutV2VisualFixture() {
  return (
    <div
      data-testid="workspace-layout-v2-visual-fixture"
      className="h-screen bg-background"
    >
      <SidebarProvider
        className="h-full min-h-0"
        defaultLeftDesktopWidthPx={304}
        defaultLeftMobileWidthPx={304}
        defaultRightDesktopWidthPx={320}
        defaultRightMobileWidthPx={320}
      >
        <WorkspaceLayoutV2
          left={<div>left</div>}
          main={<div>main</div>}
          right={<div>right</div>}
        />
      </SidebarProvider>
    </div>
  );
}
