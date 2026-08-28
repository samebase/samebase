import { AppRightSidebarContent } from "@/components/AppRightSidebar";
import { type WorkspaceLayoutV2PaneFrameProps } from "@samebase/workspace-layout/pane-frame";

export function useAppRightSidebarPane(): WorkspaceLayoutV2PaneFrameProps {
  return {
    content: <AppRightSidebarContent />,
  };
}
