import { useEffect, useRef, useState } from "react";
import { PersonIcon } from "@radix-ui/react-icons";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { prosemarkBaseThemeSetup, prosemarkBasicSetup } from "@prosemark/core";
import { useTheme } from "next-themes";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { getProsemarkFileThemeExtensions } from "@/components/prosemarkSurface";
import {
  getCodeMirrorFileLanguageKind,
  getInitialCodeMirrorLanguageExtension,
  loadCodeMirrorLanguageExtension,
} from "@/lib/codemirrorLanguage";
import { fileCodeMirrorBaseExtensions } from "@/lib/fileCodeMirrorBaseExtensions";

export type FileViewCodeParityVisualMode = "file-view-code-parity";

const FIXTURE_FILE_PATH = "src/editor-surface.ts";
const FIXTURE_DOCUMENT = `type PaneDirection = "left" | "right";

export function describePaneDrag(direction: PaneDirection) {
  const sidebar = direction === "left" ? "review" : "files";
  const count = 2;

  return {
    sidebar,
    count,
    active: count > 1,
  };
}

// Keep this comment green.`;

const FIXTURE_VAULT_KEY = "fixture-file-view-code-parity";

type ParityDiffState =
  | {
      status: "loading";
    }
  | {
      monacoSnapshotUrl: string;
      prosemarkSnapshotUrl: string;
      snapshotHeight: number;
      snapshotWidth: number;
      status: "ready";
    }
  | {
      message: string;
      status: "error";
    };

/**
 * ForeignObject snapshots need fully inlined styles because the cloned DOM no
 * longer inherits the app's stylesheet cascade once it is serialized into an
 * SVG image for diffing.
 */
function cloneNodeWithInlineStyles(node: Node): Node {
  const clone = node.cloneNode(false);

  if (node instanceof HTMLCanvasElement && clone instanceof HTMLCanvasElement) {
    clone.width = node.width;
    clone.height = node.height;
    const context = clone.getContext("2d");
    if (context && node.width > 0 && node.height > 0) {
      context.drawImage(node, 0, 0);
    }
  }

  if (node instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    clone.value = node.value;
  }

  if (
    node instanceof HTMLTextAreaElement &&
    clone instanceof HTMLTextAreaElement
  ) {
    clone.value = node.value;
  }

  if (node instanceof Element && clone instanceof Element) {
    const computedStyle = window.getComputedStyle(node);
    for (const propertyName of computedStyle) {
      clone.setAttribute(
        "style",
        `${clone.getAttribute("style") ?? ""}${propertyName}:${computedStyle.getPropertyValue(propertyName)};`,
      );
    }
  }

  for (const child of Array.from(node.childNodes)) {
    clone.appendChild(cloneNodeWithInlineStyles(child));
  }

  return clone;
}

/**
 * The live diff view shows a browser-native blend overlay, so it snapshots the
 * editor panes into standalone SVG images that can be layered without needing
 * to read any pixels back from a canvas.
 */
function serializeElementToSvgSnapshot(element: HTMLElement): {
  snapshotHeight: number;
  snapshotUrl: string;
  snapshotWidth: number;
} {
  const bounds = element.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const serializedWrapper = document.createElement("div");
  serializedWrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  serializedWrapper.style.width = `${width}px`;
  serializedWrapper.style.height = `${height}px`;
  serializedWrapper.style.overflow = "hidden";

  const clonedElement = cloneNodeWithInlineStyles(element);
  if (!(clonedElement instanceof HTMLElement)) {
    throw new Error("Parity fixture failed to clone the editor surface.");
  }

  clonedElement.style.width = `${width}px`;
  clonedElement.style.height = `${height}px`;
  serializedWrapper.appendChild(clonedElement);

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(serializedWrapper)}</foreignObject></svg>`;
  return {
    snapshotHeight: height,
    snapshotUrl: URL.createObjectURL(
      new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }),
    ),
    snapshotWidth: width,
  };
}

function StaticCodeMirrorParitySurface({
  filePath,
  onLanguageReadyChange,
  surfaceRef,
  value,
}: {
  filePath: string;
  onLanguageReadyChange: (ready: boolean) => void;
  surfaceRef: { current: HTMLDivElement | null };
  value: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pendingLanguageLoadRef = useRef<symbol | null>(null);
  const [languageReady, setLanguageReady] = useState(false);
  const { theme, systemTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const languageCompartment = new Compartment();
    const themeCompartment = new Compartment();
    const languageLoadKey = Symbol("file-view-code-parity-language");
    const effectiveTheme = theme === "system" ? systemTheme : theme;
    const isDark = effectiveTheme === "dark";
    const languageKind = getCodeMirrorFileLanguageKind(filePath);

    setLanguageReady(false);
    onLanguageReadyChange(false);
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          ...fileCodeMirrorBaseExtensions,
          languageCompartment.of(
            getInitialCodeMirrorLanguageExtension(filePath),
          ),
          prosemarkBasicSetup(),
          prosemarkBaseThemeSetup(),
          themeCompartment.of(
            getProsemarkFileThemeExtensions({ isDark, languageKind }),
          ),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    pendingLanguageLoadRef.current = languageLoadKey;

    void loadCodeMirrorLanguageExtension(filePath).then((languageExtension) => {
      if (
        pendingLanguageLoadRef.current !== languageLoadKey ||
        viewRef.current !== view
      ) {
        return;
      }

      view.dispatch({
        effects: languageCompartment.reconfigure(languageExtension),
      });
      setLanguageReady(true);
      onLanguageReadyChange(true);
    });

    return () => {
      onLanguageReadyChange(false);
      if (pendingLanguageLoadRef.current === languageLoadKey) {
        pendingLanguageLoadRef.current = null;
      }
      if (viewRef.current === view) {
        viewRef.current = null;
      }
      view.destroy();
    };
  }, [filePath, onLanguageReadyChange, systemTheme, theme, value]);

  return (
    <div
      data-testid="file-view-code-parity-prosemark"
      data-language-ready={languageReady ? "true" : "false"}
      className="h-[250px] overflow-hidden border bg-background"
      ref={surfaceRef}
    >
      <div ref={containerRef} className="h-full min-h-0 w-full" />
    </div>
  );
}

export function FileViewCodeParityVisualFixture({
  mode: _mode,
}: {
  mode: FileViewCodeParityVisualMode;
}) {
  const monacoSurfaceRef = useRef<HTMLDivElement>(null);
  const prosemarkSurfaceRef = useRef<HTMLDivElement>(null);
  const [monacoReady, setMonacoReady] = useState(false);
  const [prosemarkReady, setProsemarkReady] = useState(false);
  const [diffState, setDiffState] = useState<ParityDiffState>({
    status: "loading",
  });
  const isDiffReady = diffState.status === "ready";

  useEffect(() => {
    if (diffState.status !== "ready") {
      return;
    }

    return () => {
      URL.revokeObjectURL(diffState.monacoSnapshotUrl);
      URL.revokeObjectURL(diffState.prosemarkSnapshotUrl);
    };
  }, [diffState]);

  useEffect(() => {
    if (!monacoReady || !prosemarkReady) {
      setDiffState({ status: "loading" });
      return;
    }

    let cancelled = false;

    const renderDiff = async () => {
      const monacoSurface = monacoSurfaceRef.current;
      const prosemarkSurface = prosemarkSurfaceRef.current;
      if (!monacoSurface || !prosemarkSurface) {
        return;
      }

      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });

      try {
        const monacoSnapshot = serializeElementToSvgSnapshot(monacoSurface);
        const prosemarkSnapshot =
          serializeElementToSvgSnapshot(prosemarkSurface);

        if (cancelled) {
          URL.revokeObjectURL(monacoSnapshot.snapshotUrl);
          URL.revokeObjectURL(prosemarkSnapshot.snapshotUrl);
          return;
        }

        setDiffState({
          monacoSnapshotUrl: monacoSnapshot.snapshotUrl,
          prosemarkSnapshotUrl: prosemarkSnapshot.snapshotUrl,
          snapshotHeight: monacoSnapshot.snapshotHeight,
          snapshotWidth: monacoSnapshot.snapshotWidth,
          status: "ready",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setDiffState({
          message:
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Parity diff rendering failed.",
          status: "error",
        });
      }
    };

    void renderDiff();

    return () => {
      cancelled = true;
    };
  }, [monacoReady, prosemarkReady]);

  return (
    <SidebarProvider
      defaultOpen={true}
      defaultRightOpen={true}
      className="h-[760px] min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="file-view-code-parity-visual-fixture"
        headerTitle={FIXTURE_FILE_PATH}
        headerRight={
          <div className="font-mono text-xs text-muted-foreground">2489719</div>
        }
        onQuickOpen={() => {}}
        contentClassName="min-h-0 p-0"
        leftSidebarHeader={
          <SidebarAccountSection>
            <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
              <span className="block min-w-0 truncate">nicu@noter.md</span>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-ui md:h-6 md:w-6"
              >
                <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
                <span className="sr-only">Open user menu</span>
              </Button>
            </div>
          </SidebarAccountSection>
        }
        leftSidebarContent={
          <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
            <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Files
            </div>
            <div className="grid gap-2 p-3 text-sm">
              <div className="border border-border/50 bg-background px-3 py-2">
                {FIXTURE_FILE_PATH}
              </div>
              <div className="border border-border/50 bg-background px-3 py-2 text-muted-foreground">
                src/notes.ts
              </div>
            </div>
          </div>
        }
        rightSidebarHeader={null}
        rightSidebarContent={
          <div className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Goal
            </div>
            <div className="grid gap-2 p-3 text-sm text-muted-foreground">
              <div>Match CodeMirror to Monaco styling.</div>
              <div>
                Compare the same TypeScript file in both editors and the live
                diff.
              </div>
            </div>
          </div>
        }
      >
        <div className="flex h-full min-h-0 flex-col bg-muted/10">
          <div className="border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
            Monaco line numbers are temporarily disabled so the parity diff can
            focus on typography, spacing, and syntax color.
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="grid gap-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="corner-notch-1 border bg-background p-3">
                  <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Monaco
                  </div>
                  <div
                    data-testid="file-view-code-parity-monaco"
                    data-editor-ready={monacoReady ? "true" : "false"}
                    className="h-[250px] overflow-hidden border bg-background"
                    ref={monacoSurfaceRef}
                  >
                    <MonacoEditorSurface
                      branch="main"
                      defaultValue={FIXTURE_DOCUMENT}
                      filePath={FIXTURE_FILE_PATH}
                      onMount={() => {
                        setMonacoReady(true);
                      }}
                      syncError={null}
                      vaultKey={FIXTURE_VAULT_KEY}
                    />
                  </div>
                </div>

                <div className="corner-notch-1 border bg-background p-3">
                  <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    ProseMark
                  </div>
                  <StaticCodeMirrorParitySurface
                    filePath={FIXTURE_FILE_PATH}
                    onLanguageReadyChange={setProsemarkReady}
                    surfaceRef={prosemarkSurfaceRef}
                    value={FIXTURE_DOCUMENT}
                  />
                </div>
              </div>

              <div className="corner-notch-1 border bg-background p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Diff
                  </div>
                  <div
                    data-testid="file-view-code-parity-mismatch-count"
                    className="text-xs tabular-nums text-muted-foreground"
                  >
                    {diffState.status === "loading"
                      ? "Preparing overlay..."
                      : diffState.status === "error"
                        ? "Diff unavailable"
                        : `${diffState.snapshotWidth}x${diffState.snapshotHeight} blend`}
                  </div>
                </div>
                <div
                  data-testid="file-view-code-parity-diff"
                  data-diff-ready={isDiffReady ? "true" : "false"}
                  className="relative h-[250px] overflow-hidden border bg-white"
                >
                  {diffState.status === "error" ? (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                      {diffState.message}
                    </div>
                  ) : diffState.status === "loading" ? (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                      Preparing blend diff...
                    </div>
                  ) : (
                    <>
                      <img
                        alt=""
                        src={diffState.monacoSnapshotUrl}
                        className="absolute inset-0 h-full w-full object-fill"
                      />
                      <img
                        alt=""
                        src={diffState.prosemarkSnapshotUrl}
                        className="absolute inset-0 h-full w-full object-fill mix-blend-difference"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
