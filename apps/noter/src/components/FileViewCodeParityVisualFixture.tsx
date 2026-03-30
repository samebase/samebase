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
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
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
const PARITY_PIXEL_DIFF_PUBLIC_PATH =
  "/visual-fixtures/file-view-code-parity-pixel-diff.png";

function ignoreParitySurfaceReadyChange(_ready: boolean) {}

function buildParityDiffAssetUrl() {
  return buildPathWithUpdatedQuery(
    { pathname: PARITY_PIXEL_DIFF_PUBLIC_PATH },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, "t", `${Date.now()}`);
    },
  );
}

function StaticCodeMirrorParitySurface({
  filePath,
  onLanguageReadyChange,
  value,
}: {
  filePath: string;
  onLanguageReadyChange: (ready: boolean) => void;
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
  const [monacoReady, setMonacoReady] = useState(false);
  const [parityDiffImageState, setParityDiffImageState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [parityDiffUrl] = useState(buildParityDiffAssetUrl);

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
                Compare the same TypeScript file in both editors and the latest
                recorded pixel diff.
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
                    onLanguageReadyChange={ignoreParitySurfaceReadyChange}
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
                    {parityDiffImageState === "loading"
                      ? "Loading recorded diff..."
                      : parityDiffImageState === "error"
                        ? "Diff missing"
                        : "Latest recorded pixel diff"}
                  </div>
                </div>
                <div
                  data-testid="file-view-code-parity-diff"
                  data-diff-ready={
                    parityDiffImageState === "ready" ? "true" : "false"
                  }
                  className="grid h-[250px] gap-3 overflow-hidden border bg-white p-4"
                >
                  <div className="text-sm text-muted-foreground">
                    The diff below comes from the latest Playwright parity run.
                    Re-run the parity snapshot test to refresh it after styling
                    changes.
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden border bg-white">
                    <img
                      alt="Latest recorded parity pixel diff"
                      src={parityDiffUrl}
                      className="block h-full w-full object-contain"
                      onError={() => {
                        setParityDiffImageState("error");
                      }}
                      onLoad={() => {
                        setParityDiffImageState("ready");
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
