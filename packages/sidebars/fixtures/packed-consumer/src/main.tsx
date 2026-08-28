import { SidebarLayout, type SidebarLayoutProps } from "@samebase/sidebars/SidebarLayout";
import {
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  type SidebarLayoutMobileMinResizeBehavior,
} from "@samebase/sidebars/SidebarLayoutGeometry";
import { PaneFrame, type PaneFrameProps } from "@samebase/sidebars/PaneFrame";
import {
  buildSidebarLayoutDesktopPrehydrationScript,
  buildSidebarLayoutMobilePanePrehydrationScript,
  clearSidebarLayoutDesktopPrehydrationStyle,
  type SidebarLayoutPrehydrationState,
} from "@samebase/sidebars/SidebarLayoutPrehydration";
import {
  SidebarRuntimeProvider,
  useSidebarActions,
  useSidebarLayoutPresentation,
  type SidebarActions,
} from "@samebase/sidebars/SidebarRuntime";
import * as sidebarStateModule from "@samebase/sidebars/SidebarLayoutState";
import type { SidebarLayoutState } from "@samebase/sidebars/SidebarLayoutState";
import "@samebase/sidebars/structure.css";
import {
  SidebarLayoutMemoryProvider,
  useSidebarLayoutMemoryController,
} from "@samebase/sidebars/SidebarLayoutTesting";
import { createRoot } from "react-dom/client";

const initialState = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 240,
  rightMobileWidthPx: 240,
} satisfies SidebarLayoutState;

const prehydrationState: SidebarLayoutPrehydrationState = initialState;
const readPrehydrationState = (): SidebarLayoutPrehydrationState | null => null;
const desktopPrehydrationScript = buildSidebarLayoutDesktopPrehydrationScript(
  { desktopStyleElementId: "packed-consumer-sidebar-style" },
  readPrehydrationState,
);
const mobilePrehydrationScript = buildSidebarLayoutMobilePanePrehydrationScript(
  { desktopStyleElementId: "packed-consumer-sidebar-style" },
  readPrehydrationState,
);

const publicValues = [
  SidebarLayout,
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  PaneFrame,
  prehydrationState,
  desktopPrehydrationScript,
  mobilePrehydrationScript,
  clearSidebarLayoutDesktopPrehydrationStyle,
  SidebarRuntimeProvider,
  useSidebarActions,
  useSidebarLayoutPresentation,
  sidebarStateModule,
  SidebarLayoutMemoryProvider,
  useSidebarLayoutMemoryController,
];

const mobileResizeBehavior: SidebarLayoutMobileMinResizeBehavior = "min_resize_to_merge";
const paneFrameProps: PaneFrameProps = { content: "Main pane" };
const resizeHandleLabels: SidebarLayoutProps["resizeHandleLabels"] = {
  left: "Resize left pane",
  right: "Resize right pane",
};

function ConsumerChrome() {
  const actions: SidebarActions = useSidebarActions();
  const presentation = useSidebarLayoutPresentation();

  return (
    <button type="button" onClick={actions.toggleLeftPane}>
      {presentation.leftDesktopOpen ? "Close left pane" : "Open left pane"}
    </button>
  );
}

function PackedConsumer() {
  return (
    <SidebarLayoutMemoryProvider initialState={initialState}>
      <div data-public-value-count={publicValues.length}>
        <SidebarLayout
          addressChrome={<ConsumerChrome />}
          left={<PaneFrame content="Left pane" />}
          main={<PaneFrame {...paneFrameProps} />}
          mobileMinResizeBehavior={mobileResizeBehavior}
          resizeHandleLabels={resizeHandleLabels}
        />
      </div>
    </SidebarLayoutMemoryProvider>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The packed consumer root element is missing.");
}

createRoot(rootElement).render(<PackedConsumer />);
