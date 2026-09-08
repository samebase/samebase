import { useRef, useState } from "react";
import {
  Columns3,
  FileText,
  ListTree,
  PanelLeft,
  PanelRight,
  SquareSplitHorizontal,
} from "lucide-react";
import { PaneFrame } from "@samebase/sidebars/PaneFrame";
import { SidebarLayout } from "@samebase/sidebars/SidebarLayout";
import { SidebarLayoutMemoryProvider } from "@samebase/sidebars/SidebarLayoutTesting";
import { useSidebarActions, useSidebarLayoutPresentation } from "@samebase/sidebars/SidebarRuntime";
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

type Layout = "split" | "rail" | "row";
const LAYOUTS = [
  { id: "split", label: "Two work panes", icon: SquareSplitHorizontal },
  { id: "rail", label: "Tool rail", icon: PanelLeft },
  { id: "row", label: "Editor row", icon: Columns3 },
] as const;
const EDITORS = [
  { id: "source", label: "State", file: "SidebarLayoutState.ts", content: SOURCE },
  {
    id: "reference",
    label: "Geometry",
    file: "SidebarLayoutGeometryInternal.ts",
    content: REFERENCE,
  },
] as const;
type EditorId = (typeof EDITORS)[number]["id"];
const EDITOR_CONTENT = EDITORS.map((editor) => (
  <MonacoEditorSurface
    key={editor.id}
    branch="study"
    dataTestId={`pane-study-editor-${editor.id}`}
    defaultValue={editor.content}
    filePath={`pane-study/${editor.file}`}
    onMount={() => {}}
    syncError={null}
    repositoryKey="pane-layout-explorer"
  />
));

function WorkEditors({ layout }: { layout: Layout }) {
  const { isMobile } = useSidebarLayoutPresentation();
  const [selected, setSelected] = useState<EditorId>("source");
  const [split, setSplit] = useState(0.5);
  const workArea = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; width: number; split: number } | null>(null);
  const tabs = useRef(new Map<EditorId, HTMLButtonElement>());

  function resize(delta: number, width: number, startSplit: number) {
    const minimum = Math.min(120, width / 2);
    setSplit(Math.max(minimum, Math.min(width - minimum, width * startSplit + delta)) / width);
  }

  return (
    <div
      className="pane-study-work"
      data-mobile={isMobile ? "true" : undefined}
      data-layout={layout}
    >
      <div className="pane-study-tabs" role="tablist" aria-label="Open files" hidden={!isMobile}>
        {EDITORS.map((editor) => (
          <button
            key={editor.id}
            id={`pane-study-tab-${editor.id}`}
            type="button"
            role="tab"
            aria-selected={selected === editor.id}
            aria-controls={`pane-study-${editor.id}`}
            tabIndex={selected === editor.id ? 0 : -1}
            ref={(element) => {
              if (element) tabs.current.set(editor.id, element);
              else tabs.current.delete(editor.id);
            }}
            onClick={() => setSelected(editor.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "source"
                  : event.key === "End"
                    ? "reference"
                    : selected === "source"
                      ? "reference"
                      : "source";
              setSelected(next);
              tabs.current.get(next)?.focus();
            }}
          >
            {editor.label}
          </button>
        ))}
      </div>
      <div className="pane-study-editors" ref={workArea}>
        {EDITORS.map((editor, index) => (
          <div
            key={editor.id}
            id={`pane-study-${editor.id}`}
            className="pane-study-editor"
            role={isMobile ? "tabpanel" : undefined}
            aria-labelledby={isMobile ? `pane-study-tab-${editor.id}` : undefined}
            hidden={isMobile && selected !== editor.id}
            style={{ flexGrow: isMobile ? 1 : editor.id === "source" ? split : 1 - split }}
            onFocusCapture={() => setSelected(editor.id)}
          >
            <PaneFrame
              headerVisibility="desktop"
              header={
                <div className="pane-study-file" title={editor.file}>
                  {editor.file}
                </div>
              }
              content={EDITOR_CONTENT[index]}
            />
            {editor.id === "source" && (
              <div
                className="pane-study-splitter"
                hidden={isMobile || layout === "row"}
                role="separator"
                tabIndex={0}
                aria-label="Resize work panes"
                aria-orientation="vertical"
                aria-controls="pane-study-source pane-study-reference"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(split * 100)}
                onPointerDown={(event) => {
                  if (event.button !== 0 || !workArea.current) return;
                  event.preventDefault();
                  drag.current = {
                    startX: event.clientX,
                    width: workArea.current.clientWidth,
                    split,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId))
                    resize(
                      event.clientX - drag.current.startX,
                      drag.current.width,
                      drag.current.split,
                    );
                }}
                onPointerUp={(event) => {
                  drag.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}
                onKeyDown={(event) => {
                  if (
                    (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
                    !workArea.current
                  )
                    return;
                  event.preventDefault();
                  resize(
                    (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 96 : 24),
                    workArea.current.clientWidth,
                    split,
                  );
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StudyControls({
  layout,
  setLayout,
}: {
  layout: Layout;
  setLayout: (layout: Layout) => void;
}) {
  const { toggleLeftPane, toggleRightPane } = useSidebarActions();
  const { isMobile, mobilePane, leftDesktopOpen, rightDesktopOpen } =
    useSidebarLayoutPresentation();
  const leftShown = isMobile ? mobilePane === "left" : leftDesktopOpen;
  const rightShown = isMobile ? mobilePane === "right" : rightDesktopOpen;

  return (
    <>
      <nav className="pane-study-rail" aria-label="Tools" hidden={isMobile || layout !== "rail"}>
        <button
          type="button"
          aria-label="README"
          title="README"
          aria-pressed={leftShown}
          onClick={toggleLeftPane}
        >
          <ListTree size={24} />
        </button>
        <button
          type="button"
          aria-label="Notes"
          title="Notes"
          aria-pressed={rightShown}
          onClick={toggleRightPane}
        >
          <FileText size={24} />
        </button>
      </nav>
      <header className="pane-study-toolbar">
        <strong>sidebars</strong>
        <div className="pane-study-actions">
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
                  <DropdownMenuRadioItem key={id} value={id} onClick={() => setLayout(id)}>
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
            onClick={toggleLeftPane}
          >
            <PanelLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Right sidebar"
            title="Right sidebar"
            aria-pressed={rightShown}
            className="rounded-none"
            onClick={toggleRightPane}
          >
            <PanelRight />
          </Button>
        </div>
      </header>
    </>
  );
}

function PaneStudyLayout() {
  const [layout, setLayout] = useState<Layout>("split");

  return (
    <div className="pane-study" data-testid="pane-study" data-layout={layout}>
      <SidebarLayout
        addressChrome={<StudyControls layout={layout} setLayout={setLayout} />}
        left={
          <PaneFrame
            header={<div className="pane-study-file">README.md</div>}
            content={
              <CodeMirrorFileSurface
                dataTestId="pane-study-editor-outline"
                filePath="pane-study/README.md"
                initialValue={OUTLINE}
              />
            }
          />
        }
        main={<WorkEditors layout={layout} />}
        right={
          <PaneFrame
            header={<div className="pane-study-file">notes.md</div>}
            content={
              <CodeMirrorFileSurface
                dataTestId="pane-study-editor-notes"
                filePath="pane-study/notes.md"
                initialValue={"# Notes\n\n"}
              />
            }
          />
        }
        mobileMinResizeBehavior="min_resize_to_merge"
        resizeHandleLabels={{ left: "Resize left sidebar", right: "Resize right sidebar" }}
        formatResizeHandleValueText={({ widthPx }) => `${widthPx} pixels wide`}
      />
    </div>
  );
}

export function PaneLayoutExplorer() {
  return (
    <SidebarLayoutMemoryProvider
      initialState={{
        leftDesktopOpen: true,
        leftDesktopWidthPx: 240,
        leftMobileWidthPx: 240,
        mobilePane: "main",
        mobileSurface: { kind: "unmerged" },
        rightDesktopOpen: true,
        rightDesktopWidthPx: 288,
        rightMobileWidthPx: 288,
      }}
    >
      <PaneStudyLayout />
    </SidebarLayoutMemoryProvider>
  );
}
