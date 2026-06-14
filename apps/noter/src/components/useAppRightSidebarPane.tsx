import { AppRightSidebarContent } from "@/components/AppRightSidebar";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";

export function useAppRightSidebarPane(): WorkspaceLayoutV2PaneFrameProps {
  return {
    content: <AppRightSidebarContent />,
  };
}
