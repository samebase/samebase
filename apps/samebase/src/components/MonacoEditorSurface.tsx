import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { buildMonacoFileUri } from "@/lib/monacoFileUri";
import { useWorkspaceLayoutV2DragSurface } from "@/components/workspace-layout-v2/useWorkspaceLayoutV2DragSurface";
import {
  CODE_SURFACE_FONT_FAMILY,
  CODE_SURFACE_FONT_SIZE_PX,
  CODE_SURFACE_LINE_HEIGHT_PX,
} from "@/lib/codeSurfaceTypography";

export interface MonacoEditorSurfaceProps {
  branch: string;
  dataTestId?: string;
  defaultValue: string;
  disableFolding?: boolean;
  disableLineNumbers?: boolean;
  filePath: string;
  onMount: OnMount;
  showMobileLineNumbers?: boolean;
  syncError: string | null;
  vaultKey: string;
}

const MIN_EDITOR_HEIGHT_PX = 400;

/**
Below this surface width, gutter chrome (line numbers, folding) is shed so a
deliberately narrow pane keeps its columns for code.
*/
const NARROW_PANE_MAX_WIDTH_PX = 448;

/**
 * Shared Monaco wrapper that owns mobile pane drag, pointer-capability chrome
 * (scrollbars, overview ruler), and narrow-pane gutter shedding. The
 * collaborative editor uses it directly, and visual fixtures reuse the same
 * surface so mobile drag coverage exercises the shipped shell handoff instead
 * of a test-only stand-in.
 */
export function MonacoEditorSurface({
  branch,
  dataTestId,
  defaultValue,
  disableFolding = false,
  disableLineNumbers = false,
  filePath,
  onMount,
  showMobileLineNumbers = false,
  syncError,
  vaultKey,
}: MonacoEditorSurfaceProps) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";
  // Touch conventions (hidden scrollbars, no overview ruler) follow pointer
  // capability. Width-consuming gutter chrome (line numbers, folding) also
  // sheds when the pane is narrow, whatever the pointer; showMobileLineNumbers
  // is an explicit consumer override past both hide reasons.
  const isCoarsePointer = useCoarsePointer();
  const containerRef = useRef<HTMLDivElement>(null);
  const mobilePaneDrag = useWorkspaceLayoutV2DragSurface(true);
  const [editorHeightPx, setEditorHeightPx] = useState(MIN_EDITOR_HEIGHT_PX);
  const [isNarrowPane, setIsNarrowPane] = useState(false);
  const showLineNumbers =
    !disableLineNumbers && ((!isCoarsePointer && !isNarrowPane) || showMobileLineNumbers);
  const showFolding = !disableFolding && !isCoarsePointer && !isNarrowPane;

  useEffect(() => {
    const containerNode = containerRef.current;
    if (!(containerNode instanceof HTMLDivElement)) {
      return;
    }

    /**
     * Monaco needs a concrete pixel height because nested flex layouts can
     * make percentage heights collapse even when the surface is visibly
     * taller. The same measurement reports the surface width so gutter chrome
     * sheds in narrow panes.
     */
    const updateEditorLayout = () => {
      const containerRect = containerNode.getBoundingClientRect();
      const nextHeightPx = Math.max(MIN_EDITOR_HEIGHT_PX, Math.round(containerRect.height));
      setEditorHeightPx((currentHeightPx) =>
        currentHeightPx === nextHeightPx ? currentHeightPx : nextHeightPx,
      );
      setIsNarrowPane(containerRect.width < NARROW_PANE_MAX_WIDTH_PX);
    };

    updateEditorLayout();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateEditorLayout);
      return () => {
        window.removeEventListener("resize", updateEditorLayout);
      };
    }

    const resizeObserver = new ResizeObserver(updateEditorLayout);
    resizeObserver.observe(containerNode);
    window.addEventListener("resize", updateEditorLayout);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateEditorLayout);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid={dataTestId}
      className="notranslate relative h-full min-h-0 w-full"
      translate="no"
      style={{
        height: "100%",
        minHeight: MIN_EDITOR_HEIGHT_PX,
      }}
      {...mobilePaneDrag.containerProps}
    >
      <Editor
        height={`${editorHeightPx}px`}
        path={buildMonacoFileUri({ vaultId: vaultKey, branch, filePath })}
        defaultValue={defaultValue}
        theme={isDark ? "vs-dark" : "vs"}
        onMount={onMount}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            vertical: isCoarsePointer ? "hidden" : "auto",
            verticalScrollbarSize: isCoarsePointer ? 0 : 10,
            // Coarse-pointer Monaco delegates horizontal touch drags to the
            // shell, so keep wrapped content and remove the horizontal
            // scrollbar cue.
            horizontal: isCoarsePointer ? "hidden" : "auto",
            horizontalScrollbarSize: isCoarsePointer ? 0 : 10,
          },
          overviewRulerLanes: isCoarsePointer ? 0 : 2,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          fontFamily: CODE_SURFACE_FONT_FAMILY,
          fontLigatures: false,
          fontSize: CODE_SURFACE_FONT_SIZE_PX,
          lineHeight: CODE_SURFACE_LINE_HEIGHT_PX,
          tabSize: 2,
          lineNumbers: showLineNumbers ? "on" : "off",
          lineNumbersMinChars: showLineNumbers ? 3 : 0,
          glyphMargin: false,
          folding: showFolding,
          ...(showLineNumbers
            ? {}
            : {
                lineDecorationsWidth: 0,
              }),
          padding: {
            top: 0,
            bottom: 0,
          },
        }}
      />
      {syncError ? (
        <div className="pointer-events-none absolute bottom-2 right-2 corner-notch-1 bg-red-600/90 px-2 py-1 text-[11px] text-white">
          {syncError}
        </div>
      ) : null}
    </div>
  );
}
