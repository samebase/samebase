import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Columns3, FileText, ListTree, PanelLeft, SquareSplitHorizontal, X } from "lucide-react";
import { PaneFrame } from "@samebase/sidebars/PaneFrame";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import "./paneLayoutExplorer.css";

const PANES = [
  { id: "outline", title: "Outline", file: "brief.md", width: 220, minimum: 180 },
  { id: "source", title: "Source", file: "panes.ts", width: 400, minimum: 280 },
  { id: "reference", title: "Reference", file: "layout.ts", width: 400, minimum: 280 },
  { id: "notes", title: "Notes", file: "review.md", width: 240, minimum: 180 },
] as const;
type PaneId = (typeof PANES)[number]["id"];
type Layout = "split" | "rail" | "row";

const LAYOUTS = [
  { id: "split", label: "Two work panes", icon: SquareSplitHorizontal },
  { id: "rail", label: "Tool rail", icon: PanelLeft },
  { id: "row", label: "Pane row", icon: Columns3 },
] as const;

const DESCRIPTIONS = {
  split:
    "Close Outline or Notes to give the two work panes more space. Select its name above to reopen it.",
  rail: "Outline and Notes share one slot. The icon strip switches that slot. Source and Reference stay visible.",
  row: "Each pane keeps a useful width. Select a pane above or scroll sideways to bring it into view.",
} satisfies Record<Layout, string>;

const OUTLINE = `# Four panes

## Task

Compare the pane model with the layout rules. Record your findings in Notes.

## Files

- brief.md
- panes.ts
- layout.ts
- review.md

## Try this

1. Edit text in each pane.
2. Resize the work panes.
3. Close Notes, then reopen it above.
4. Switch the layout.
5. Return to your text.

## On a phone

Swipe across the pane headers or select a pane by name. Try a swipe inside each editor too.

Text selection and vertical scrolling must remain usable.

## Decision

Which arrangement helps you compare two files without losing your notes?
`;

const SOURCE = `type PaneId = "outline" | "source" | "reference" | "notes";

type Pane = {
  id: PaneId;
  title: string;
  preferredWidth: number;
};

export const panes: Pane[] = [
  { id: "outline", title: "Outline", preferredWidth: 220 },
  { id: "source", title: "Source", preferredWidth: 400 },
  { id: "reference", title: "Reference", preferredWidth: 400 },
  { id: "notes", title: "Notes", preferredWidth: 240 },
];

export function findPane(id: PaneId) {
  return panes.find((pane) => pane.id === id);
}

export function getTotalWidth(items: Pane[]) {
  return items.reduce((total, pane) => total + pane.preferredWidth, 0);
}

export function movePane(items: Pane[], from: number, to: number) {
  const result = [...items];
  const [pane] = result.splice(from, 1);
  if (pane) result.splice(to, 0, pane);
  return result;
}

// Try a long selection, then resize this pane.
export const purpose = "Keep the document, reference material, and review notes available while the user compares changes.";
`;

const REFERENCE = `type Layout = "split" | "rail" | "row";

type Workspace = {
  layout: Layout;
  activePane: string;
  closedSidebars: string[];
};

export const workspace: Workspace = {
  layout: "split",
  activePane: "source",
  closedSidebars: [],
};

export function closeSidebar(state: Workspace, id: string): Workspace {
  return { ...state, activePane: "source", closedSidebars: [...state.closedSidebars, id] };
}

export function selectPane(state: Workspace, id: string): Workspace {
  return { ...state, activePane: id, closedSidebars: state.closedSidebars.filter((pane) => pane !== id) };
}

// A layout change must keep the same editor instance.
// Its text, undo history, and scroll position belong to the pane.
// A hidden pane can return to its previous place.
// A rail button selects a tool. It is not an editor pane.

export const question = "How much space should each pane keep when the window becomes narrower?";
`;

const NOTES = `# Review notes

## Two work panes

Both files stay visible. The outer panes use some of the available width.

- Compare Source with Reference.
- Try this at laptop width.
- Close a sidebar, then select its name above to reopen it.

## Tool rail

Outline and Notes take turns in the same slot. This leaves more space for the two files.

- Switch between the two tools.
- Check whether you miss seeing both.

## Pane row

Each pane keeps its width. Some content can sit outside the window.

- Use the pane names to navigate.
- Try horizontal trackpad scrolling.
- Select text with the mouse.

## Your findings

Write here. These edits stay in this page while you switch layouts. Reload starts a fresh demo.
`;

const CONTENT = {
  outline: (
    <CodeMirrorFileSurface
      dataTestId="pane-study-editor-outline"
      filePath="pane-study/brief.md"
      initialValue={OUTLINE}
    />
  ),
  notes: (
    <CodeMirrorFileSurface
      dataTestId="pane-study-editor-notes"
      filePath="pane-study/review.md"
      initialValue={NOTES}
    />
  ),
  source: (
    <MonacoEditorSurface
      branch="study"
      dataTestId="pane-study-editor-source"
      defaultValue={SOURCE}
      filePath="pane-study/panes.ts"
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
      filePath="pane-study/layout.ts"
      onMount={() => {}}
      syncError={null}
      repositoryKey="pane-layout-explorer"
    />
  ),
} satisfies Record<PaneId, ReactNode>;

export function PaneLayoutExplorer() {
  const [layout, setLayout] = useState<Layout>("split");
  const [active, setActive] = useState<PaneId>("outline");
  const [tool, setTool] = useState<"outline" | "notes">("outline");
  const [closed, setClosed] = useState({ outline: false, notes: false });
  const [widths, setWidths] = useState<Partial<Record<PaneId, number>>>({});
  const [measuredWidths, setMeasuredWidths] = useState(new Map<PaneId, number>());
  const viewport = useRef<HTMLDivElement>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);
  const elements = useRef(new Map<PaneId, HTMLDivElement>());
  const drag = useRef<{
    x: number;
    left: (typeof PANES)[number];
    right: (typeof PANES)[number] | undefined;
    leftWidth: number;
    rightWidth: number;
  } | null>(null);
  const open = PANES.filter(
    (pane) => pane.id === "source" || pane.id === "reference" || !closed[pane.id],
  );
  const visible =
    layout === "rail"
      ? [PANES[tool === "outline" ? 0 : 3], PANES[1], PANES[2]].filter((pane) =>
          open.includes(pane),
        )
      : open;
  // Separator announcements and trailing scroll space follow actual pane widths.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      const next = new Map<PaneId, number>();
      for (const [id, element] of elements.current)
        next.set(id, Math.round(element.getBoundingClientRect().width));
      setMeasuredWidths((previous) =>
        [...next].every(([id, width]) => previous.get(id) === width) ? previous : next,
      );
    });
    for (const element of elements.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function selectPane(id: PaneId) {
    flushSync(() => {
      setActive(id);
      if (id === "outline" || id === "notes") {
        setTool(id);
        if (closed[id]) {
          setClosed((previous) => ({ ...previous, [id]: false }));
          rebalanceWorkPanes();
        }
      }
    });
    elements.current
      .get(id)
      ?.scrollIntoView({ block: "nearest", inline: "start", behavior: "instant" });
  }

  function rebalanceWorkPanes() {
    if (layout === "row") return;
    setWidths((previous) => {
      const next = { ...previous };
      delete next.source;
      delete next.reference;
      return next;
    });
  }

  function closeSidebar(id: "outline" | "notes") {
    flushSync(() => {
      setClosed((previous) => ({ ...previous, [id]: true }));
      rebalanceWorkPanes();
    });
    selectPane("source");
    sourceButton.current?.focus({ preventScroll: true });
  }

  function resize(delta: number) {
    const current = drag.current;
    if (!current) return;
    const { left, right, leftWidth, rightWidth } = current;
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
    <div className="pane-explorer" data-testid="pane-explorer">
      <header className="pane-explorer-toolbar">
        <strong>Pane study</strong>
        <div className="pane-explorer-layouts" aria-label="Layout options">
          {LAYOUTS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={layout === id}
              onClick={() => {
                flushSync(() => {
                  setLayout(id);
                  setWidths({});
                  if (id === "rail" && (active === "outline" || active === "notes"))
                    setTool(active);
                });
                elements.current
                  .get(active)
                  ?.scrollIntoView({ block: "nearest", inline: "start", behavior: "instant" });
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </header>
      <nav className="pane-explorer-navigation" aria-label="Panes">
        {PANES.map((pane) => (
          <button
            key={pane.id}
            type="button"
            ref={pane.id === "source" ? sourceButton : undefined}
            aria-current={active === pane.id ? "true" : undefined}
            onClick={() => selectPane(pane.id)}
          >
            {pane.title}
          </button>
        ))}
        <button className="pane-explorer-reset" type="button" onClick={() => setWidths({})}>
          Reset widths
        </button>
      </nav>
      <div className="pane-explorer-workspace" data-layout={layout}>
        <nav className="pane-explorer-rail" aria-label="Tools">
          <button
            type="button"
            title="Outline"
            aria-label="Show Outline"
            aria-pressed={tool === "outline" && !closed.outline}
            onClick={() => selectPane("outline")}
          >
            <ListTree size={24} />
          </button>
          <button
            type="button"
            title="Notes"
            aria-label="Show Notes"
            aria-pressed={tool === "notes" && !closed.notes}
            onClick={() => selectPane("notes")}
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
                data-closed={
                  (pane.id === "outline" || pane.id === "notes") && closed[pane.id]
                    ? "true"
                    : undefined
                }
                style={{
                  flexBasis:
                    widths[pane.id] ?? (layout === "row" ? Math.max(pane.width, 420) : pane.width),
                  flexGrow: widths[pane.id] ? 0 : undefined,
                  flexShrink: widths[pane.id] ? 0 : undefined,
                }}
                ref={(element) => {
                  if (element) elements.current.set(pane.id, element);
                  else elements.current.delete(pane.id);
                }}
                onFocusCapture={() => setActive(pane.id)}
              >
                <PaneFrame
                  header={
                    <div className="pane-explorer-pane-header">
                      <span>
                        {pane.title}
                        <small>{pane.file}</small>
                      </span>
                      {(pane.id === "outline" || pane.id === "notes") && (
                        <button
                          type="button"
                          aria-label={`Close ${pane.title}`}
                          title={`Close ${pane.title}`}
                          onClick={() => closeSidebar(pane.id)}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  }
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
              flexBasis: `max(0px, calc(100% - ${measuredWidths.get(closed.notes ? "reference" : "notes") ?? 420}px))`,
            }}
          />
        </div>
      </div>
      <footer className="pane-explorer-caption">
        <span className="pane-explorer-desktop-caption">{DESCRIPTIONS[layout]}</span>
        <span className="pane-explorer-mobile-caption">
          Swipe pane headers or select a pane above.
        </span>
        <span>Local demo. Reload resets edits.</span>
      </footer>
    </div>
  );
}
