import {
  prehydrateSidebarLayoutDesktop,
  prehydrateSidebarLayoutMobilePane,
} from "@samebase/sidebars/SidebarLayoutPrehydration";
import { APP_WORKSPACE_SIDEBAR_PREHYDRATION_ARGS } from "./appWorkspaceSidebarPreferences";
import { readLocalWorkspaceSidebarState } from "./localWorkspaceSidebarState";

/**
Applies the local sidebar state to the server markup of a page that renders without a session,
before the first paint: the desktop widths and open state through a temporary stylesheet, and the
mobile pane, widths, and scroll position on the layout. The shell renders it as an inline script
right after the layout, compiled from this file at build time (`dev/inlineScriptPlugin.ts`).
*/
export default function prehydrateAppWorkspaceSidebar() {
  prehydrateSidebarLayoutDesktop(
    APP_WORKSPACE_SIDEBAR_PREHYDRATION_ARGS,
    readLocalWorkspaceSidebarState,
  );
  prehydrateSidebarLayoutMobilePane(
    APP_WORKSPACE_SIDEBAR_PREHYDRATION_ARGS,
    readLocalWorkspaceSidebarState,
  );
}
