import { useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  Columns3,
  FileText,
  ListTree,
  PanelLeft,
  PanelRight,
  SquareSplitHorizontal,
} from "lucide-react";
import { PaneFrame } from "@samebase/sidebars/PaneFrame";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import OUTLINE from "../../../../packages/sidebars/README.md?raw";
import SOURCE from "../../../../packages/sidebars/src/SidebarLayoutState.ts?raw";
import REFERENCE from "../../../../packages/sidebars/src/SidebarLayoutGeometryInternal.ts?raw";
import "./paneLayoutExplorer.css";

const PANES = [
  { id: "outline", title: "Outline", file: "README.md", width: 220, minimum: 180 },
  { id: "source", title: "Source", file: "SidebarLayoutState.ts", width: 400, minimum: 280 },
  {
    id: "reference",
    title: "Reference",
    file: "SidebarLayoutGeometryInternal.ts",
    width: 400,
    minimum: 280,
  },
  { id: "notes", title: "Notes", file: "notes.md", width: 240, minimum: 180 },
] as const;
const WORK_MINIMUM = PANES[1].minimum + PANES[2].minimum;
type PaneId = (typeof PANES)[number]["id"];
type Layout = "split" | "rail" | "row";

const LAYOUTS = [
  { id: "split", label: "Two work panes", icon: SquareSplitHorizontal },
  { id: "rail", label: "Tool rail", icon: PanelLeft },
  { id: "row", label: "Pane row", icon: Columns3 },
] as const;

const CONTENT = {
  outline: (
    <CodeMirrorFileSurface
      dataTestId="pane-study-editor-outline"
      filePath="pane-study/README.md"
      initialValue={OUTLINE}
    />
  ),
  notes: (
    <CodeMirrorFileSurface
      dataTestId="pane-study-editor-notes"
      filePath="pane-study/notes.md"
      initialValue={"# Notes\n\n"}
    />
  ),
  source: (
    <MonacoEditorSurface
      branch="study"
      dataTestId="pane-study-editor-source"
      defaultValue={SOURCE}
      filePath="pane-study/SidebarLayoutState.ts"
      onMount={() => {}}
      syncError={null}
      repositoryKey="pane-layout-explorer"
    />
  ),
  reference: (
    <MonacoEditorSurface
      branch="study"
      dataTestId="pane-study-editor-reference"
      defaultValue={REFERENCE}
      filePath="pane-study/SidebarLayoutGeometryInternal.ts"
      onMount={() => {}}
      syncError={null}
      repositoryKey="pane-layout-explorer"
    />
  ),
} satisfies Record<PaneId, ReactNode>;

export function PaneLayoutExplorer() {
  const [layout, setLayout] = useState<Layout>("split");
  const [active, setActive] = useState<PaneId>("source");
  const [tool, setTool] = useState<"outline" | "notes">("outline");
  const [desktopOpen, setDesktopOpen] = useState({ outline: true, notes: true });
  const [isMobile, setIsMobile] = useState(false);
  const [widths, setWidths] = useState<Partial<Record<PaneId, number>>>({});
  const [rowWidths, setRowWidths] = useState<Partial<Record<PaneId, number>>>({});
  const [measuredWidths, setMeasuredWidths] = useState(new Map<PaneId, number>());
  const viewport = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const lastWorkPane = useRef<"source" | "reference">("source");
  const elements = useRef(new Map<PaneId, HTMLDivElement>());
  const drag = useRef<{
    x: number;
    left: (typeof PANES)[number];
    right: (typeof PANES)[number] | undefined;
    leftWidth: number;
    rightWidth: number;
    workWidth: number;
  } | null>(null);
  const open = PANES.filter(
    (pane) => isMobile || pane.id === "source" || pane.id === "reference" || desktopOpen[pane.id],
  );
  const visible =
    layout === "rail" && !isMobile
      ? [PANES[tool === "outline" ? 0 : 3], PANES[1], PANES[2]].filter((pane) =>
          open.includes(pane),
        )
      : open;
  const leftShown = isMobile
    ? active === "outline"
    : layout === "rail"
      ? desktopOpen[tool]
      : desktopOpen.outline;
  const rightShown = isMobile ? active === "notes" : desktopOpen.notes;
  const alignActivePane = useEffectEvent(() => {
    elements.current
      .get(active)
      ?.scrollIntoView({ block: "nearest", inline: "start", behavior: "instant" });
  });
  // Keep the selected pane in view when the page changes between desktop and mobile.
  useLayoutEffect(() => alignActivePane(), [isMobile]);
  // Controls and separator announcements follow the rendered page and pane sizes.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (root.current) setIsMobile(root.current.getBoundingClientRect().width < 900);
      const next = new Map<PaneId, number>();
      for (const [id, element] of elements.current)
        next.set(id, Math.round(element.getBoundingClientRect().width));
      setMeasuredWidths((previous) =>
        [...next].every(([id, width]) => previous.get(id) === width) ? previous : next,
      );
    });
    for (const element of elements.current.values()) observer.observe(element);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  function selectPane(id: PaneId) {
    flushSync(() => {
      setActive(id);
      if (id === "source" || id === "reference") lastWorkPane.current = id;
    });
    elements.current
      .get(id)
      ?.scrollIntoView({ block: "nearest", inline: "start", behavior: "instant" });
  }

  function toggleSidebar(id: "outline" | "notes") {
    if (isMobile) {
      selectPane(active === id ? lastWorkPane.current : id);
      return;
    }
    flushSync(() => {
      setDesktopOpen((previous) => ({ ...previous, [id]: !previous[id] }));
    });
    if (!desktopOpen[id]) selectPane(id);
    else if (active === id) selectPane(lastWorkPane.current);
  }

  function resize(delta: number) {
    const current = drag.current;
    if (!current) return;
    const { left, right, leftWidth, rightWidth, workWidth } = current;
    if (layout === "row") {
      const change = Math.max(left.minimum - leftWidth, delta);
      setRowWidths((previous) => ({ ...previous, [left.id]: leftWidth + change }));
      return;
    }
    if (left.id === "outline" || left.id === "notes") {
      const change = Math.max(left.minimum - leftWidth, Math.min(delta, workWidth - WORK_MINIMUM));
      setWidths((previous) => ({ ...previous, [left.id]: leftWidth + change }));
      return;
    }
    if (right?.id === "notes") {
      const change = Math.max(
        WORK_MINIMUM - workWidth,
        Math.min(delta, rightWidth - right.minimum),
      );
      setWidths((previous) => ({ ...previous, notes: rightWidth - change }));
      return;
    }
    const change = Math.max(
      left.minimum - leftWidth,
      right ? Math.min(delta, rightWidth - right.minimum) : delta,
    );
    setWidths((previous) => ({
      ...previous,
      [left.id]: leftWidth + change,
      ...(right ? { [right.id]: rightWidth - change } : {}),
    }));
  }

  return (
    <div className="pane-explorer" data-testid="pane-explorer" data-active-pane={active} ref={root}>
      <header className="pane-explorer-toolbar">
        <strong>sidebars</strong>
        <div className="pane-explorer-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Layout"
                title="Layout"
                className="rounded-none"
              >
                <SquareSplitHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={layout}>
                {LAYOUTS.map(({ id, label, icon: Icon }) => (
                  <DropdownMenuRadioItem
                    key={id}
                    value={id}
                    onClick={() => {
                      flushSync(() => {
                        setLayout(id);
                        if (id === "rail" && (active === "outline" || active === "notes"))
                          setTool(active);
                      });
                      elements.current.get(active)?.scrollIntoView({
                        block: "nearest",
                        inline: "start",
                        behavior: "instant",
                      });
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Left sidebar"
            title="Left sidebar"
            aria-pressed={leftShown}
            className="rounded-none"
            onClick={() => toggleSidebar(!isMobile && layout === "rail" ? tool : "outline")}
          >
            <PanelLeft />
          </Button>
          {(isMobile || layout !== "rail") && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Right sidebar"
              title="Right sidebar"
              aria-pressed={rightShown}
              className="rounded-none"
              onClick={() => toggleSidebar("notes")}
            >
              <PanelRight />
            </Button>
          )}
        </div>
      </header>
      <div className="pane-explorer-workspace" data-layout={layout}>
        <nav className="pane-explorer-rail" aria-label="Tools">
          <button
            type="button"
            title="Outline"
            aria-label="Show Outline"
            aria-pressed={tool === "outline" && desktopOpen.outline}
            onClick={() => {
              if (tool === "outline") toggleSidebar("outline");
              else {
                flushSync(() => {
                  setTool("outline");
                  setDesktopOpen((previous) => ({ ...previous, outline: true }));
                });
                selectPane("outline");
              }
            }}
          >
            <ListTree size={24} />
          </button>
          <button
            type="button"
            title="Notes"
            aria-label="Show Notes"
            aria-pressed={tool === "notes" && desktopOpen.notes}
            onClick={() => {
              if (tool === "notes") toggleSidebar("notes");
              else {
                flushSync(() => {
                  setTool("notes");
                  setDesktopOpen((previous) => ({ ...previous, notes: true }));
                });
                selectPane("notes");
              }
            }}
          >
            <FileText size={24} />
          </button>
        </nav>
        <div
          className="pane-explorer-viewport"
          ref={viewport}
          onScroll={() => {
            const host = viewport.current;
            if (!host || host.scrollWidth <= host.clientWidth + 1) return;
            const edge = host.getBoundingClientRect().left;
            let nearest = active;
            let distance = Infinity;
            for (const [id, element] of elements.current) {
              if (element.offsetWidth === 0) continue;
              const next = Math.abs(element.getBoundingClientRect().left - edge);
              if (next < distance) {
                nearest = id;
                distance = next;
              }
            }
            setActive(nearest);
            if (nearest === "source" || nearest === "reference") lastWorkPane.current = nearest;
          }}
        >
          {PANES.map((pane) => {
            const next = visible.at(visible.indexOf(pane) + 1);
            return (
              <div
                key={pane.id}
                id={`pane-study-${pane.id}`}
                className="pane-explorer-pane"
                data-pane={pane.id}
                data-parked={
                  layout === "rail" &&
                  (pane.id === "outline" || pane.id === "notes") &&
                  pane.id !== tool
                    ? "true"
                    : undefined
                }
                data-desktop-collapsed={
                  (pane.id === "outline" || pane.id === "notes") && !desktopOpen[pane.id]
                    ? "true"
                    : undefined
                }
                style={{
                  flexBasis:
                    layout === "row"
                      ? (rowWidths[pane.id] ?? 420)
                      : pane.id === "source" || pane.id === "reference"
                        ? 0
                        : (widths[pane.id] ?? pane.width),
                  flexGrow:
                    layout !== "row" && (pane.id === "source" || pane.id === "reference")
                      ? (widths[pane.id] ?? 400)
                      : 0,
                }}
                ref={(element) => {
                  if (element) elements.current.set(pane.id, element);
                  else elements.current.delete(pane.id);
                }}
                onFocusCapture={() => {
                  setActive(pane.id);
                  if (pane.id === "source" || pane.id === "reference")
                    lastWorkPane.current = pane.id;
                }}
              >
                <PaneFrame
                  header={<div className="pane-explorer-pane-header">{pane.file}</div>}
                  content={CONTENT[pane.id]}
                />
                {(next || layout === "row") && (
                  <div
                    className="pane-explorer-divider"
                    role="separator"
                    tabIndex={0}
                    aria-label={`Resize ${pane.title}`}
                    aria-orientation="vertical"
                    aria-controls={`pane-study-${pane.id}`}
                    aria-valuemin={pane.minimum}
                    aria-valuenow={measuredWidths.get(pane.id) ?? pane.width}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      const element = elements.current.get(pane.id);
                      if (!element) return;
                      drag.current = {
                        x: event.clientX,
                        left: pane,
                        right: layout === "row" ? undefined : next,
                        leftWidth: element.getBoundingClientRect().width,
                        rightWidth: next
                          ? (elements.current.get(next.id)?.getBoundingClientRect().width ??
                            next.width)
                          : 0,
                        workWidth:
                          (elements.current.get("source")?.getBoundingClientRect().width ?? 280) +
                          (elements.current.get("reference")?.getBoundingClientRect().width ?? 280),
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId) && drag.current)
                        resize(event.clientX - drag.current.x);
                    }}
                    onPointerUp={(event) => {
                      drag.current = null;
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onLostPointerCapture={() => {
                      drag.current = null;
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      drag.current = {
                        x: 0,
                        left: pane,
                        right: layout === "row" ? undefined : next,
                        leftWidth:
                          elements.current.get(pane.id)?.getBoundingClientRect().width ??
                          pane.width,
                        rightWidth: next
                          ? (elements.current.get(next.id)?.getBoundingClientRect().width ??
                            next.width)
                          : 0,
                        workWidth:
                          (elements.current.get("source")?.getBoundingClientRect().width ?? 280) +
                          (elements.current.get("reference")?.getBoundingClientRect().width ?? 280),
                      };
                      resize((event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 64 : 16));
                      drag.current = null;
                    }}
                  />
                )}
              </div>
            );
          })}
          <div
            aria-hidden="true"
            className="pane-explorer-end-space"
            style={{
              flexBasis: `max(0px, calc(100% - ${measuredWidths.get(desktopOpen.notes ? "notes" : "reference") ?? 420}px))`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
