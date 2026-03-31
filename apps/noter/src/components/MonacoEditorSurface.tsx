import { useRef } from "react";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildMonacoFileUri } from "@/lib/monacoFileUri";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";
import {
  CODE_SURFACE_FONT_FAMILY,
  CODE_SURFACE_FONT_SIZE_PX,
  CODE_SURFACE_LINE_HEIGHT_PX,
} from "@/lib/codeSurfaceTypography";

export interface MonacoEditorSurfaceProps {
  branch: string;
  defaultValue: string;
  disableFolding?: boolean;
  disableLineNumbers?: boolean;
  filePath: string;
  onMount: OnMount;
  showMobileLineNumbers?: boolean;
  syncError: string | null;
  vaultKey: string;
}

/**
 * Shared Monaco wrapper that owns mobile pane drag and Monaco's mobile-specific
 * layout options. The collaborative editor uses it directly, and visual
 * fixtures reuse the same surface so mobile drag coverage exercises the
 * shipped shell handoff instead of a test-only stand-in.
 */
export function MonacoEditorSurface({
  branch,
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
  const isMobileViewport = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const mobilePaneDrag = useProsemarkMobilePaneDrag(true, containerRef);
  const showLineNumbers =
    !disableLineNumbers && (!isMobileViewport || showMobileLineNumbers);
  const showFolding = !disableFolding && !isMobileViewport;

  return (
    <div
      ref={containerRef}
      className="notranslate relative h-full min-h-0 w-full"
      translate="no"
      style={{
        height: "100%",
        minHeight: "400px",
        touchAction: mobilePaneDrag.touchAction,
      }}
      {...mobilePaneDrag.containerProps}
    >
      <Editor
        height="100%"
        path={buildMonacoFileUri({ vaultId: vaultKey, branch, filePath })}
        defaultValue={defaultValue}
        theme={isDark ? "vs-dark" : "vs"}
        onMount={onMount}
        options={{
          minimap: { enabled: false },
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            vertical: isMobileViewport ? "hidden" : "auto",
            verticalScrollbarSize: isMobileViewport ? 0 : 10,
            // Mobile Monaco now delegates horizontal touch drags to the shell,
            // so keep wrapped content and remove the horizontal scrollbar cue.
            horizontal: isMobileViewport ? "hidden" : "auto",
            horizontalScrollbarSize: isMobileViewport ? 0 : 10,
          },
          overviewRulerLanes: isMobileViewport ? 0 : 2,
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
