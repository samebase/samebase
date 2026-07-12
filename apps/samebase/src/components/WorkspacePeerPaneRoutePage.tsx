import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from "react";
import { useLocation } from "@tanstack/react-router";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { WorkspaceLayoutV2ResizeHandle } from "@/components/workspace-layout-v2/WorkspaceLayoutV2ResizeHandle";
import { useElementSize } from "@/hooks/useElementSize";
import { useIsMobile } from "@/hooks/use-mobile";
import { clampNumber } from "@/lib/clampNumber";
import appWorkspaceShellSourceRaw from "./AppWorkspaceShell.tsx?raw";
import workspaceLayoutSourceRaw from "./workspace-layout-v2/WorkspaceLayoutV2.tsx?raw";

const WORKSPACE_PEER_ROUTE_DEFAULT_PANE_COUNT = 4;
const WORKSPACE_PEER_PANE_MIN_WIDTH_PX = 240;
const WORKSPACE_PEER_MOBILE_SETTLE_DELAY_MS = 80;

type WorkspacePeerPaneId = "files" | "editor" | "preview" | "terminal" | "notes";

type WorkspacePeerPane = {
  defaultDesktopWidthPx: number;
  id: WorkspacePeerPaneId;
  minDesktopWidthPx: number;
  title: string;
  content: ReactNode;
};

type WorkspacePeerPaneWidths = Record<WorkspacePeerPaneId, number>;

type WorkspacePeerPaneTrackStyle = CSSProperties & {
  width: string;
};

function handleNoopMonacoMount() {
  return undefined;
}

function WorkspacePeerFilesPane() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {[
        "apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx",
        "apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry.ts",
        "apps/samebase/src/components/workspace-layout-v2/useWorkspaceLayoutV2MobileCarousel.ts",
        "apps/samebase/src/components/AppWorkspaceShell.tsx",
        "apps/workspace-layout-v2-solid/src/routes/workspace-layout-page.tsx",
      ].map((filePath) => (
        <div key={filePath} className="border-b border-border px-3 py-2 text-sm">
          {filePath}
        </div>
      ))}
    </div>
  );
}

function WorkspacePeerPreviewPane() {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-sm leading-6">
      <div className="max-w-prose">
        <p>
          V2 is currently a two-sided shell: left, main, right. This route treats panes as peers so
          desktop resizing happens between neighboring panes and mobile navigation is ordinary
          horizontal snap.
        </p>
        <p className="mt-4">
          Change the route with the address editor: <code>panes=3</code>, <code>panes=4</code>,{" "}
          <code>panes=5</code>, or <code>pane=terminal</code>.
        </p>
      </div>
    </div>
  );
}

function WorkspacePeerTerminalPane() {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-foreground p-3 font-mono text-[13px] leading-6 text-background">
      <div>$ pnpm dev</div>
      <div>workspace-layout-v2 route ready</div>
      <div>$ panes=4</div>
      <div>files editor preview terminal</div>
      <div>$ pane=terminal</div>
      <div>mobile carousel target updated</div>
    </div>
  );
}

const WORKSPACE_PEER_PANES = [
  {
    id: "files",
    title: "Files",
    minDesktopWidthPx: WORKSPACE_PEER_PANE_MIN_WIDTH_PX,
    defaultDesktopWidthPx: 360,
    content: <WorkspacePeerFilesPane />,
  },
  {
    id: "editor",
    title: "Editor",
    minDesktopWidthPx: WORKSPACE_PEER_PANE_MIN_WIDTH_PX,
    defaultDesktopWidthPx: 360,
    content: (
      <MonacoEditorSurface
        branch="workspace-peer"
        dataTestId="workspace-peer-pane-editor-surface"
        defaultValue={workspaceLayoutSourceRaw}
        disableFolding
        filePath="src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx"
        onMount={handleNoopMonacoMount}
        syncError={null}
        vaultKey="workspace-peer"
      />
    ),
  },
  {
    id: "preview",
    title: "Preview",
    minDesktopWidthPx: WORKSPACE_PEER_PANE_MIN_WIDTH_PX,
    defaultDesktopWidthPx: 360,
    content: <WorkspacePeerPreviewPane />,
  },
  {
    id: "terminal",
    title: "Terminal",
    minDesktopWidthPx: WORKSPACE_PEER_PANE_MIN_WIDTH_PX,
    defaultDesktopWidthPx: 360,
    content: <WorkspacePeerTerminalPane />,
  },
  {
    id: "notes",
    title: "Notes",
    minDesktopWidthPx: WORKSPACE_PEER_PANE_MIN_WIDTH_PX,
    defaultDesktopWidthPx: 360,
    content: (
      <CodeMirrorFileSurface
        dataTestId="workspace-peer-pane-notes-surface"
        filePath="src/components/AppWorkspaceShell.tsx"
        initialValue={appWorkspaceShellSourceRaw}
      />
    ),
  },
] satisfies readonly WorkspacePeerPane[];

function createDefaultWorkspacePeerPaneWidths() {
  return WORKSPACE_PEER_PANES.reduce<WorkspacePeerPaneWidths>(
    (widths, pane) => ({
      ...widths,
      [pane.id]: pane.defaultDesktopWidthPx,
    }),
    {
      files: 0,
      editor: 0,
      preview: 0,
      terminal: 0,
      notes: 0,
    },
  );
}

function areWorkspacePeerPaneWidthsEqual(
  left: WorkspacePeerPaneWidths,
  right: WorkspacePeerPaneWidths,
) {
  return (
    left.files === right.files &&
    left.editor === right.editor &&
    left.preview === right.preview &&
    left.terminal === right.terminal &&
    left.notes === right.notes
  );
}

function readWorkspacePeerPaneCount(search: Record<string, unknown>) {
  const value = search.panes;
  if (value === undefined) {
    return WORKSPACE_PEER_ROUTE_DEFAULT_PANE_COUNT;
  }

  const parsedValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (parsedValue === 3 || parsedValue === 4 || parsedValue === 5) {
    return parsedValue;
  }

  return WORKSPACE_PEER_ROUTE_DEFAULT_PANE_COUNT;
}

function readWorkspacePeerPaneId(
  search: Record<string, unknown>,
  visiblePanes: readonly WorkspacePeerPane[],
) {
  const value = search.pane;
  const pane = visiblePanes.find((candidate) => candidate.id === value);

  if (pane !== undefined) {
    return pane.id;
  }

  return visiblePanes[0].id;
}

function fitWorkspacePeerPaneWidths(args: {
  panes: readonly WorkspacePeerPane[];
  viewportWidthPx: number;
  widths: WorkspacePeerPaneWidths;
}) {
  const nextWidths = args.panes.reduce<WorkspacePeerPaneWidths>(
    (widths, pane) => ({
      ...widths,
      [pane.id]: Math.max(args.widths[pane.id], pane.minDesktopWidthPx),
    }),
    { ...args.widths },
  );
  if (args.viewportWidthPx <= 0 || args.panes.length === 0) {
    return nextWidths;
  }

  const minimumTotalWidthPx = args.panes.reduce(
    (totalWidthPx, pane) => totalWidthPx + pane.minDesktopWidthPx,
    0,
  );
  const targetTotalWidthPx = Math.max(args.viewportWidthPx, minimumTotalWidthPx);
  const currentTotalWidthPx = args.panes.reduce(
    (totalWidthPx, pane) => totalWidthPx + nextWidths[pane.id],
    0,
  );

  if (currentTotalWidthPx < targetTotalWidthPx) {
    const extraWidthPx = Math.floor((targetTotalWidthPx - currentTotalWidthPx) / args.panes.length);
    const remainderWidthPx =
      targetTotalWidthPx - currentTotalWidthPx - extraWidthPx * args.panes.length;
    args.panes.forEach((pane, index) => {
      nextWidths[pane.id] += extraWidthPx + (index < remainderWidthPx ? 1 : 0);
    });
    return nextWidths;
  }

  if (currentTotalWidthPx <= targetTotalWidthPx) {
    return nextWidths;
  }

  let overflowPx = currentTotalWidthPx - targetTotalWidthPx;
  while (overflowPx > 0) {
    const shrinkablePanes = args.panes.filter(
      (pane) => nextWidths[pane.id] > pane.minDesktopWidthPx,
    );
    if (shrinkablePanes.length === 0) {
      return nextWidths;
    }

    const shrinkStepPx = Math.max(1, Math.ceil(overflowPx / shrinkablePanes.length));
    shrinkablePanes.forEach((pane) => {
      if (overflowPx <= 0) {
        return;
      }

      const availableShrinkPx = nextWidths[pane.id] - pane.minDesktopWidthPx;
      const shrinkPx = Math.min(availableShrinkPx, shrinkStepPx, overflowPx);
      nextWidths[pane.id] -= shrinkPx;
      overflowPx -= shrinkPx;
    });
  }

  return nextWidths;
}

function WorkspacePeerPaneFrame({
  pane,
  viewport,
}: {
  pane: WorkspacePeerPane;
  viewport: "desktop" | "mobile";
}) {
  return (
    <section
      data-testid={`workspace-peer-pane-${viewport}-${pane.id}`}
      data-workspace-peer-pane={pane.id}
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-background"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3 text-sm font-medium">
        {pane.title}
      </div>
      {pane.content}
    </section>
  );
}

function WorkspacePeerDesktopLayout({ panes }: { panes: readonly WorkspacePeerPane[] }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  const [paneWidths, setPaneWidths] = useState(createDefaultWorkspacePeerPaneWidths);
  useElementSize(viewportRef, (size) => setViewportWidthPx(size.widthPx));

  useEffect(() => {
    setPaneWidths((currentWidths) => {
      const nextWidths = fitWorkspacePeerPaneWidths({
        panes,
        viewportWidthPx,
        widths: currentWidths,
      });
      return areWorkspacePeerPaneWidthsEqual(currentWidths, nextWidths)
        ? currentWidths
        : nextWidths;
    });
  }, [panes, viewportWidthPx]);

  const totalWidthPx = panes.reduce((totalWidthPx, pane) => totalWidthPx + paneWidths[pane.id], 0);
  const trackStyle: WorkspacePeerPaneTrackStyle = {
    width: `${Math.max(totalWidthPx, viewportWidthPx)}px`,
  };
  let handlePositionPx = 0;

  return (
    <div
      ref={viewportRef}
      className="hidden h-full min-h-0 overflow-x-auto overflow-y-hidden md:block"
    >
      <div className="relative h-full min-h-0" style={trackStyle}>
        <div className="flex h-full min-h-0">
          {panes.map((pane) => (
            <div
              key={pane.id}
              style={{ width: `${paneWidths[pane.id]}px` }}
              className="h-full min-h-0 shrink-0"
            >
              <WorkspacePeerPaneFrame pane={pane} viewport="desktop" />
            </div>
          ))}
        </div>
        {panes.slice(0, -1).map((pane, index) => {
          const nextPane = panes[index + 1];
          handlePositionPx += paneWidths[pane.id];
          const pairTotalWidthPx = paneWidths[pane.id] + paneWidths[nextPane.id];
          const leftMaxWidthPx = pairTotalWidthPx - nextPane.minDesktopWidthPx;
          return (
            <WorkspaceLayoutV2ResizeHandle
              key={`${pane.id}-${nextPane.id}`}
              ariaLabel={`Resize ${pane.title} and ${nextPane.title}`}
              currentSizePx={paneWidths[pane.id]}
              dataTestId={`workspace-peer-pane-resize-${pane.id}-${nextPane.id}`}
              maxSizePx={leftMaxWidthPx}
              minSizePx={pane.minDesktopWidthPx}
              onSizeChange={(nextWidthPx) => {
                setPaneWidths((currentWidths) => {
                  const clampedLeftWidthPx = clampNumber(
                    Math.round(nextWidthPx),
                    pane.minDesktopWidthPx,
                    leftMaxWidthPx,
                  );
                  return {
                    ...currentWidths,
                    [pane.id]: clampedLeftWidthPx,
                    [nextPane.id]: pairTotalWidthPx - clampedLeftWidthPx,
                  };
                });
              }}
              pointerTarget="edge"
              positionPx={handlePositionPx}
              resizeFrom="left"
            />
          );
        })}
      </div>
    </div>
  );
}

function WorkspacePeerMobileLayout({
  activePaneId,
  panes,
  setActivePaneId,
}: {
  activePaneId: WorkspacePeerPaneId;
  panes: readonly WorkspacePeerPane[];
  setActivePaneId: (paneId: WorkspacePeerPaneId) => void;
}) {
  const isMobile = useIsMobile();
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  const paneNodesRef = useRef(new Map<WorkspacePeerPaneId, HTMLElement>());

  useLayoutEffect(() => {
    if (!isMobile) {
      return;
    }

    const carouselNode = carouselRef.current;
    const paneNode = paneNodesRef.current.get(activePaneId);
    if (carouselNode === null || paneNode === undefined) {
      return;
    }

    carouselNode.scrollLeft = paneNode.offsetLeft;
  }, [activePaneId, isMobile, panes]);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current !== null) {
        window.clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

  function syncActivePaneFromScroll(carouselNode: HTMLDivElement) {
    const nearestPane = panes.reduce<WorkspacePeerPane | null>((nearest, pane) => {
      const paneNode = paneNodesRef.current.get(pane.id);
      const nearestNode = nearest === null ? null : paneNodesRef.current.get(nearest.id);
      if (paneNode === undefined) {
        return nearest;
      }
      if (nearest === null || nearestNode === undefined || nearestNode === null) {
        return pane;
      }

      return Math.abs(paneNode.offsetLeft - carouselNode.scrollLeft) <
        Math.abs(nearestNode.offsetLeft - carouselNode.scrollLeft)
        ? pane
        : nearest;
    }, null);

    if (nearestPane !== null) {
      setActivePaneId(nearestPane.id);
    }
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const carouselNode = event.currentTarget;
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
    }

    settleTimeoutRef.current = window.setTimeout(() => {
      syncActivePaneFromScroll(carouselNode);
    }, WORKSPACE_PEER_MOBILE_SETTLE_DELAY_MS);
  }

  return (
    <div
      ref={carouselRef}
      data-active-peer-pane={activePaneId}
      className="flex h-full min-h-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
      onScroll={handleScroll}
    >
      {panes.map((pane) => (
        <div
          key={pane.id}
          ref={(node) => {
            if (node === null) {
              paneNodesRef.current.delete(pane.id);
              return;
            }
            paneNodesRef.current.set(pane.id, node);
          }}
          className="h-full min-h-0 w-full shrink-0 snap-start snap-always"
        >
          <WorkspacePeerPaneFrame pane={pane} viewport="mobile" />
        </div>
      ))}
    </div>
  );
}

function WorkspacePeerPaneExperiment() {
  const routeSearch = useLocation({ select: (location) => location.search });
  const paneCount = readWorkspacePeerPaneCount(routeSearch);
  const panes = useMemo(() => WORKSPACE_PEER_PANES.slice(0, paneCount), [paneCount]);
  const requestedPaneId = readWorkspacePeerPaneId(routeSearch, panes);
  const [activeMobilePaneId, setActiveMobilePaneId] = useState(requestedPaneId);

  useEffect(() => {
    setActiveMobilePaneId(requestedPaneId);
  }, [requestedPaneId]);

  return (
    <div data-testid="workspace-peer-pane-route" className="h-full min-h-0 bg-background">
      <WorkspacePeerDesktopLayout panes={panes} />
      <WorkspacePeerMobileLayout
        activePaneId={activeMobilePaneId}
        panes={panes}
        setActivePaneId={setActiveMobilePaneId}
      />
    </div>
  );
}

export function WorkspacePeerPaneRoutePage() {
  return (
    <AppWorkspaceRouteChrome
      dataTestId="workspace-peer-pane-route-shell"
      left={null}
      leftToggleVisibility="hidden"
      right={null}
      rightToggleVisibility="hidden"
    >
      <WorkspacePeerPaneExperiment />
    </AppWorkspaceRouteChrome>
  );
}
