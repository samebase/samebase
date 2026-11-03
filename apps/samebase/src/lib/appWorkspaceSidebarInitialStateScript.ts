import { writeSidebarLayoutRootState } from "@samebase/sidebars/SidebarLayoutRootState";
import { readLocalWorkspaceSidebarState } from "./localWorkspaceSidebarState";

/**
Writes the local sidebar state on the layout root of a page that renders without a session, before
the browser parses the panes, so the first paint shows the stored pane, widths, and open state. The
layout renders it as an inline script, the root's first child, compiled from this file at build time
(`dev/inlineScriptPlugin.ts`).
*/
export default function writeAppWorkspaceSidebarInitialState() {
  const root = document.currentScript?.parentElement;
  const state = readLocalWorkspaceSidebarState();
  if (root instanceof HTMLElement && state !== null) {
    writeSidebarLayoutRootState(root, state);
  }
}
