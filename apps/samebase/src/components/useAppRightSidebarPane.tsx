import { AppRightSidebarContent } from "@/components/AppRightSidebar";
import { type PaneFrameProps } from "@samebase/sidebars/PaneFrame";

export function useAppRightSidebarPane(): PaneFrameProps {
  return {
    content: <AppRightSidebarContent />,
  };
}
