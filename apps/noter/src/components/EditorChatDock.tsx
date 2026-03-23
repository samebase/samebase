import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/button";
import { EditorChatPanel } from "@/components/EditorChatPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const EDITOR_CHAT_MIN_HEIGHT = 12 * 16;
const EDITOR_CHAT_DEFAULT_HEIGHT = 18 * 16;
const EDITOR_CHAT_MOBILE_DEFAULT_HEIGHT_RATIO = 0.3;
const EDITOR_CHAT_MAX_HEIGHT_RATIO = 0.7;
const EDITOR_CHAT_MOBILE_BOTTOM_INSET =
  "max(0.5rem,env(safe-area-inset-bottom))";

function getMaxEditorChatHeight(): number {
  if (typeof window === "undefined") {
    return EDITOR_CHAT_DEFAULT_HEIGHT;
  }
  return Math.max(
    EDITOR_CHAT_MIN_HEIGHT,
    Math.floor(window.innerHeight * EDITOR_CHAT_MAX_HEIGHT_RATIO),
  );
}

function clampEditorChatHeight(height: number): number {
  return Math.max(
    EDITOR_CHAT_MIN_HEIGHT,
    Math.min(height, getMaxEditorChatHeight()),
  );
}

function getDefaultEditorChatHeight(): number {
  if (typeof window === "undefined") {
    return EDITOR_CHAT_DEFAULT_HEIGHT;
  }
  const mobileDefaultHeight = Math.floor(
    window.innerHeight * EDITOR_CHAT_MOBILE_DEFAULT_HEIGHT_RATIO,
  );
  const preferredHeight =
    window.innerWidth < 768 ? mobileDefaultHeight : EDITOR_CHAT_DEFAULT_HEIGHT;
  return clampEditorChatHeight(preferredHeight);
}

function getMobileEditorChatDockInset(height: number): string {
  return `calc(${height}px + ${EDITOR_CHAT_MOBILE_BOTTOM_INSET})`;
}

function ResizeGripLines() {
  return (
    <div aria-hidden="true" className="flex items-center gap-1 text-current">
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="h-2.5 w-px rounded-full bg-current" />
      ))}
    </div>
  );
}

type EditorChatDockProps = {
  vaultId?: Id<"vaults">;
  repositoryFullName?: string;
  branch?: string;
  filePath?: string;
  desktopMode?: "inline" | "floating";
  onMobileDockInsetChange?: (dockInset: string | undefined) => void;
  zIndexClassName?: string;
};

export function EditorChatDock({
  vaultId,
  repositoryFullName,
  branch,
  filePath,
  desktopMode = "floating",
  onMobileDockInsetChange,
  zIndexClassName,
}: EditorChatDockProps) {
  const dashboardSettings = useQuery(
    api.dashboardSettings.getDashboardSettings,
    {},
  );
  const setEditorChatOpen = useMutation(
    api.dashboardSettings.setEditorChatOpen,
  );
  const isMobileViewport = useIsMobile();
  const [editorChatOpenState, setEditorChatOpenState] = useState<
    boolean | null
  >(null);
  const [shouldAutoFocusInput, setShouldAutoFocusInput] = useState(false);
  const [editorChatHeight, setEditorChatHeight] = useState<number>(() =>
    getDefaultEditorChatHeight(),
  );
  const editorChatPendingRef = useRef<boolean | null>(null);
  const latestEditorChatServerValueRef = useRef(false);
  const editorChatResizeRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);
  const editorChatKeyboardResizeTimeoutRef = useRef<number | null>(null);
  const [isEditorChatResizing, setIsEditorChatResizing] = useState(false);

  useEffect(() => {
    const serverValue = dashboardSettings?.editorChatOpen;
    if (serverValue === undefined) {
      return;
    }
    latestEditorChatServerValueRef.current = serverValue;
    if (editorChatPendingRef.current !== null) {
      if (editorChatPendingRef.current === serverValue) {
        editorChatPendingRef.current = null;
      } else {
        return;
      }
    }
    setEditorChatOpenState(serverValue);
  }, [dashboardSettings?.editorChatOpen]);

  useEffect(() => {
    const handleResize = () => {
      setEditorChatHeight((current) => clampEditorChatHeight(current));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isEditorChatResizing || editorChatResizeRef.current === null) {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      return;
    }

    document.body.style.setProperty("cursor", "ns-resize");
    document.body.style.setProperty("user-select", "none");
    return () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [isEditorChatResizing]);

  useEffect(() => {
    return () => {
      if (editorChatKeyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(editorChatKeyboardResizeTimeoutRef.current);
      }
    };
  }, []);

  const editorChatOpen =
    editorChatOpenState ?? dashboardSettings?.editorChatOpen ?? false;
  const mobileEditorChatDockInset =
    isMobileViewport && editorChatOpen
      ? getMobileEditorChatDockInset(editorChatHeight)
      : undefined;

  useEffect(() => {
    onMobileDockInsetChange?.(mobileEditorChatDockInset);
  }, [mobileEditorChatDockInset, onMobileDockInsetChange]);

  useEffect(() => {
    return () => onMobileDockInsetChange?.(undefined);
  }, [onMobileDockInsetChange]);

  const handleEditorChatOpenChange = useCallback(
    (isOpen: boolean, options?: { focusInput?: boolean }) => {
      setShouldAutoFocusInput(Boolean(isOpen && options?.focusInput));
      setEditorChatOpenState(isOpen);
      editorChatPendingRef.current = isOpen;
      void setEditorChatOpen({ isOpen }).catch((error: unknown) => {
        console.error("Failed to persist editor chat state:", error);
        editorChatPendingRef.current = null;
        setShouldAutoFocusInput(false);
        setEditorChatOpenState(latestEditorChatServerValueRef.current);
      });
    },
    [setEditorChatOpen],
  );

  const handleEditorChatResizeBy = useCallback((delta: number) => {
    setEditorChatHeight((current) => clampEditorChatHeight(current + delta));
  }, []);

  const handleEditorChatResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      editorChatResizeRef.current = {
        startY: event.clientY,
        startHeight: editorChatHeight,
      };
      setIsEditorChatResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [editorChatHeight],
  );

  const handleEditorChatResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = editorChatResizeRef.current;
      if (!dragState) {
        return;
      }
      const nextHeight = clampEditorChatHeight(
        dragState.startHeight + (dragState.startY - event.clientY),
      );
      setEditorChatHeight(nextHeight);
    },
    [],
  );

  const handleEditorChatResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      editorChatResizeRef.current = null;
      setIsEditorChatResizing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleEditorChatResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 96 : 24;
      const delta =
        event.key === "ArrowUp" || event.key === "ArrowRight"
          ? step
          : event.key === "ArrowDown" || event.key === "ArrowLeft"
            ? -step
            : 0;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      setIsEditorChatResizing(true);
      handleEditorChatResizeBy(delta);
      if (editorChatKeyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(editorChatKeyboardResizeTimeoutRef.current);
      }
      editorChatKeyboardResizeTimeoutRef.current = window.setTimeout(() => {
        setIsEditorChatResizing(false);
        editorChatKeyboardResizeTimeoutRef.current = null;
      }, 120);
    },
    [handleEditorChatResizeBy],
  );

  const editorChatMaxHeight = getMaxEditorChatHeight();
  const dockZIndexClassName =
    zIndexClassName ?? (desktopMode === "floating" ? "z-[9999]" : "z-20");
  const editorChatDockWrapperClassName = isMobileViewport
    ? cn(
        "fixed inset-x-0 bottom-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        dockZIndexClassName,
      )
    : desktopMode === "inline"
      ? "min-h-0 shrink-0"
      : cn(
          "fixed inset-x-3 bottom-0 mx-auto w-[calc(100vw-1.5rem)] max-w-5xl",
          dockZIndexClassName,
        );
  const editorChatPanelClassName =
    isMobileViewport || desktopMode === "floating"
      ? "h-full"
      : "h-full -mx-4 sm:mx-0";
  const editorChatReopenButtonClassName = cn(
    "right-3 flex h-11 w-11 items-center justify-center corner-notch-1 border-0 bg-primary p-0 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90",
    isMobileViewport
      ? "fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
      : "fixed bottom-3",
    dockZIndexClassName,
  );
  const resizeGrip = (
    <div
      role="separator"
      aria-label="Resize chat panel"
      aria-orientation="horizontal"
      aria-valuemin={EDITOR_CHAT_MIN_HEIGHT}
      aria-valuemax={editorChatMaxHeight}
      aria-valuenow={Math.round(editorChatHeight)}
      aria-valuetext={`${Math.round(editorChatHeight)} pixels tall`}
      tabIndex={0}
      className={cn(
        "flex h-4 w-full cursor-row-resize touch-none items-center justify-center corner-notch-1 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isEditorChatResizing && "bg-accent text-foreground",
      )}
      onKeyDown={handleEditorChatResizeKeyDown}
      onPointerDown={handleEditorChatResizeStart}
      onPointerMove={handleEditorChatResizeMove}
      onPointerUp={handleEditorChatResizeEnd}
      onPointerCancel={handleEditorChatResizeEnd}
      onLostPointerCapture={() => {
        editorChatResizeRef.current = null;
        setIsEditorChatResizing(false);
      }}
    >
      <ResizeGripLines />
    </div>
  );

  return (
    <>
      {!editorChatOpen ? (
        <Button
          type="button"
          size="icon"
          variant="default"
          onClick={() =>
            handleEditorChatOpenChange(true, {
              focusInput: true,
            })
          }
          aria-label="Open chat"
          title="Open chat"
          className={editorChatReopenButtonClassName}
        >
          <span aria-hidden="true" className="h-4 w-4 bg-current" />
        </Button>
      ) : null}
      {editorChatOpen ? (
        <div className={editorChatDockWrapperClassName}>
          <div
            className="flex h-full min-h-0 flex-col"
            style={{ height: `${editorChatHeight}px` }}
          >
            <div className="min-h-0 flex-1">
              <EditorChatPanel
                vaultId={vaultId}
                repositoryFullName={repositoryFullName}
                branch={branch}
                filePath={filePath}
                autoFocusInput={shouldAutoFocusInput}
                className={editorChatPanelClassName}
                headerResizeHandle={resizeGrip}
                onClose={() => {
                  setShouldAutoFocusInput(false);
                  handleEditorChatOpenChange(false);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
