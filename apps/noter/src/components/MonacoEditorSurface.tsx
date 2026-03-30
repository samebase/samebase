import { useRef } from "react";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildMonacoFileUri } from "@/lib/monacoFileUri";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";

export interface MonacoEditorSurfaceProps {
  branch: string;
  defaultValue: string;
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
  const lineNumbersMode = isMobileViewport
    ? showMobileLineNumbers
      ? "on"
      : "off"
    : "on";

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
          fontSize: 14,
          tabSize: 2,
          lineNumbers: lineNumbersMode,
          lineNumbersMinChars: isMobileViewport ? 2 : 3,
          glyphMargin: false,
          folding: !isMobileViewport,
          lineDecorationsWidth: isMobileViewport ? 0 : 10,
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
