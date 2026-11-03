import { writeSidebarLayoutRootState } from "@samebase/sidebars/SidebarLayoutRootState";
import { readExampleSidebarStoredState } from "./exampleSidebarStorage";

/**
Writes the stored sidebar state on the layout root before the browser parses the panes, so the
prerendered page shows it from the first paint. The layout renders it as an inline script, the
root's first child, compiled from this file at build time (`dev/inlineScriptPlugin.ts`).
*/
export default function writeExampleSidebarInitialState() {
  const root = document.currentScript?.parentElement;
  const state = readExampleSidebarStoredState();
  if (root instanceof HTMLElement && state !== null) {
    writeSidebarLayoutRootState(root, state);
  }
}
