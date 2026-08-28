import { AppRightSidebarContent } from "@/components/AppRightSidebar";
import { type PaneFrameProps } from "@samebase/sidebars/pane-frame";

export function useAppRightSidebarPane(): PaneFrameProps {
  return {
    content: <AppRightSidebarContent />,
  };
}
