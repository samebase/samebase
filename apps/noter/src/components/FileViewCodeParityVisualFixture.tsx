import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { Input } from "@/components/input";
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
const PARITY_METRICS_PUBLIC_PATH =
  "/visual-fixtures/file-view-code-parity-metrics.json";
const PARITY_PIXEL_DIFF_PUBLIC_PATH =
  "/visual-fixtures/file-view-code-parity-pixel-diff.png";
const PARITY_EDITOR_RESOLUTION_SCALE_DEFAULT = 1;
const PARITY_EDITOR_RESOLUTION_SCALE_MAX = 4;
const PARITY_EDITOR_RESOLUTION_SCALE_MIN = 1;
const PARITY_MONACO_DIFF_COLOR = "#ff3b30";
const PARITY_PROSEMARK_DIFF_COLOR = "#007aff";
const PARITY_DIFF_BACKGROUND_CHANNEL_THRESHOLD = 245;
const PARITY_DIFF_PREVIEW_PADDING_PX = 12;

type ParityForegroundBounds = {
  height: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
};

type ParityForegroundBoundsMetrics = {
  actual: {
    bounds: ParityForegroundBounds;
    label: string;
  };
  captureScale: number;
  deltaX: number;
  deltaY: number;
  expected: {
    bounds: ParityForegroundBounds;
    label: string;
  };
};

function ignoreParitySurfaceReadyChange(_ready: boolean) {}

function buildParityArtifactUrl(args: {
  pathname: string;
  refreshKey: number;
}) {
  return buildPathWithUpdatedQuery(
    { pathname: args.pathname },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, "t", `${args.refreshKey}`);
    },
  );
}

function clampParityEditorResolutionScale(value: number) {
  return Math.min(
    PARITY_EDITOR_RESOLUTION_SCALE_MAX,
    Math.max(PARITY_EDITOR_RESOLUTION_SCALE_MIN, Math.round(value)),
  );
}

function getParityScaledCaptureStyle(
  resolutionScale: number,
): CSSProperties | undefined {
  const clampedResolutionScale =
    clampParityEditorResolutionScale(resolutionScale);

  if (clampedResolutionScale === 1) {
    return undefined;
  }

  return {
    height: `${clampedResolutionScale * 100}%`,
    transform: `scale(${1 / clampedResolutionScale})`,
    transformOrigin: "top left",
    width: `${clampedResolutionScale * 100}%`,
  };
}

function isParityForegroundBounds(
  value: unknown,
): value is ParityForegroundBounds {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "height") === "number" &&
    typeof Reflect.get(value, "maxX") === "number" &&
    typeof Reflect.get(value, "maxY") === "number" &&
    typeof Reflect.get(value, "minX") === "number" &&
    typeof Reflect.get(value, "minY") === "number" &&
    typeof Reflect.get(value, "width") === "number"
  );
}

function isParityForegroundBoundsMetrics(
  value: unknown,
): value is ParityForegroundBoundsMetrics {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const actual = Reflect.get(value, "actual");
  const expected = Reflect.get(value, "expected");

  return (
    typeof Reflect.get(value, "captureScale") === "number" &&
    typeof Reflect.get(value, "deltaX") === "number" &&
    typeof Reflect.get(value, "deltaY") === "number" &&
    typeof actual === "object" &&
    actual !== null &&
    typeof Reflect.get(actual, "label") === "string" &&
    isParityForegroundBounds(Reflect.get(actual, "bounds")) &&
    typeof expected === "object" &&
    expected !== null &&
    typeof Reflect.get(expected, "label") === "string" &&
    isParityForegroundBounds(Reflect.get(expected, "bounds"))
  );
}

function measureParityDiffForegroundBounds(image: HTMLImageElement) {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
  );
  let minX = image.naturalWidth;
  let minY = image.naturalHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.naturalHeight; y += 1) {
    for (let x = 0; x < image.naturalWidth; x += 1) {
      const index = (y * image.naturalWidth + x) * 4;
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      const alpha = imageData.data[index + 3];
      const isBackground =
        alpha === 0 ||
        (red >= PARITY_DIFF_BACKGROUND_CHANNEL_THRESHOLD &&
          green >= PARITY_DIFF_BACKGROUND_CHANNEL_THRESHOLD &&
          blue >= PARITY_DIFF_BACKGROUND_CHANNEL_THRESHOLD);

      if (isBackground) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    maxX,
    maxY,
    minX,
    minY,
  };
}

function buildParityDiffPreviewUrl(image: HTMLImageElement) {
  const bounds = measureParityDiffForegroundBounds(image);
  if (!bounds) {
    return null;
  }

  const cropMinX = Math.max(0, bounds.minX - PARITY_DIFF_PREVIEW_PADDING_PX);
  const cropMinY = Math.max(0, bounds.minY - PARITY_DIFF_PREVIEW_PADDING_PX);
  const cropMaxX = Math.min(
    image.naturalWidth - 1,
    bounds.maxX + PARITY_DIFF_PREVIEW_PADDING_PX,
  );
  const cropMaxY = Math.min(
    image.naturalHeight - 1,
    bounds.maxY + PARITY_DIFF_PREVIEW_PADDING_PX,
  );
  const cropWidth = cropMaxX - cropMinX + 1;
  const cropHeight = cropMaxY - cropMinY + 1;
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    cropMinX,
    cropMinY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return canvas.toDataURL("image/png");
}

function StaticCodeMirrorParitySurface({
  filePath,
  onLanguageReadyChange,
  resolutionScale,
  value,
}: {
  filePath: string;
  onLanguageReadyChange: (ready: boolean) => void;
  resolutionScale: number;
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
      <div
        data-testid="file-view-code-parity-prosemark-capture"
        className="h-full min-h-0 w-full overflow-hidden"
      >
        <div
          style={getParityScaledCaptureStyle(resolutionScale)}
          className="h-full min-h-0 w-full origin-top-left"
        >
          <div ref={containerRef} className="h-full min-h-0 w-full" />
        </div>
      </div>
    </div>
  );
}

export function FileViewCodeParityVisualFixture({
  mode: _mode,
}: {
  mode: FileViewCodeParityVisualMode;
}) {
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(() =>
    Date.now(),
  );
  const [boundsMetrics, setBoundsMetrics] =
    useState<ParityForegroundBoundsMetrics | null>(null);
  const [boundsMetricsState, setBoundsMetricsState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [monacoReady, setMonacoReady] = useState(false);
  const [editorResolutionScale, setEditorResolutionScale] = useState(
    PARITY_EDITOR_RESOLUTION_SCALE_DEFAULT,
  );
  const [parityDiffImageState, setParityDiffImageState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [parityDiffPreviewUrl, setParityDiffPreviewUrl] = useState<
    string | null
  >(null);
  const [parityDiffPreviewLoaded, setParityDiffPreviewLoaded] = useState(false);
  const parityDiffUrl = buildParityArtifactUrl({
    pathname: PARITY_PIXEL_DIFF_PUBLIC_PATH,
    refreshKey: artifactRefreshKey,
  });
  const parityMetricsUrl = buildParityArtifactUrl({
    pathname: PARITY_METRICS_PUBLIC_PATH,
    refreshKey: artifactRefreshKey,
  });

  useEffect(() => {
    const onRefreshArtifacts = () => {
      setArtifactRefreshKey(Date.now());
      setBoundsMetricsState("loading");
      setParityDiffImageState("loading");
      setParityDiffPreviewUrl(null);
      setParityDiffPreviewLoaded(false);
    };

    window.addEventListener(
      "file-view-code-parity-refresh-artifacts",
      onRefreshArtifacts,
    );

    return () => {
      window.removeEventListener(
        "file-view-code-parity-refresh-artifacts",
        onRefreshArtifacts,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBoundsMetricsState("loading");

    void fetch(parityMetricsUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Parity metrics missing");
        }

        const nextValue: unknown = await response.json();
        if (!isParityForegroundBoundsMetrics(nextValue)) {
          throw new Error("Parity metrics invalid");
        }

        if (cancelled) {
          return;
        }

        setBoundsMetrics(nextValue);
        setBoundsMetricsState("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setBoundsMetrics(null);
        setBoundsMetricsState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [parityMetricsUrl]);

  useEffect(() => {
    let cancelled = false;
    setParityDiffImageState("loading");
    setParityDiffPreviewLoaded(false);
    setParityDiffPreviewUrl(null);

    const artifactImage = new Image();
    artifactImage.decoding = "async";
    artifactImage.onload = () => {
      if (cancelled) {
        return;
      }

      setParityDiffImageState("ready");
      setParityDiffPreviewUrl(buildParityDiffPreviewUrl(artifactImage));
      setParityDiffPreviewLoaded(true);
    };
    artifactImage.onerror = () => {
      if (cancelled) {
        return;
      }

      setParityDiffImageState("error");
      setParityDiffPreviewUrl(null);
      setParityDiffPreviewLoaded(false);
    };
    artifactImage.src = parityDiffUrl;

    return () => {
      cancelled = true;
      artifactImage.onload = null;
      artifactImage.onerror = null;
    };
  }, [parityDiffUrl]);

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
                    <div
                      data-testid="file-view-code-parity-monaco-capture"
                      className="h-full min-h-0 w-full overflow-hidden"
                    >
                      <div
                        style={getParityScaledCaptureStyle(
                          editorResolutionScale,
                        )}
                        className="h-full min-h-0 w-full origin-top-left"
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
                  </div>
                </div>

                <div className="corner-notch-1 border bg-background p-3">
                  <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    ProseMark
                  </div>
                  <StaticCodeMirrorParitySurface
                    filePath={FIXTURE_FILE_PATH}
                    onLanguageReadyChange={ignoreParitySurfaceReadyChange}
                    resolutionScale={editorResolutionScale}
                    value={FIXTURE_DOCUMENT}
                  />
                </div>
              </div>

              <div className="corner-notch-1 border bg-background p-3">
                <div className="mb-3 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Diff
                  </div>
                  <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <label htmlFor="file-view-code-parity-resolution-scale">
                        Resolution
                      </label>
                      <input
                        aria-label="Parity resolution scale"
                        type="range"
                        min={PARITY_EDITOR_RESOLUTION_SCALE_MIN}
                        max={PARITY_EDITOR_RESOLUTION_SCALE_MAX}
                        step={1}
                        value={editorResolutionScale}
                        onChange={(event) => {
                          setEditorResolutionScale(
                            clampParityEditorResolutionScale(
                              Number(event.currentTarget.value),
                            ),
                          );
                        }}
                        className="h-2 w-32 accent-foreground"
                      />
                      <Input
                        id="file-view-code-parity-resolution-scale"
                        type="number"
                        inputMode="numeric"
                        min={PARITY_EDITOR_RESOLUTION_SCALE_MIN}
                        max={PARITY_EDITOR_RESOLUTION_SCALE_MAX}
                        step={1}
                        value={editorResolutionScale}
                        onChange={(event) => {
                          const nextValue = Number(event.currentTarget.value);
                          if (!Number.isFinite(nextValue)) {
                            return;
                          }

                          setEditorResolutionScale(
                            clampParityEditorResolutionScale(nextValue),
                          );
                        }}
                        className="h-8 w-16 bg-background px-2 py-1 text-right font-mono text-xs"
                      />
                      <span>{editorResolutionScale}x</span>
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
                </div>
                <div
                  data-testid="file-view-code-parity-diff"
                  data-diff-ready={
                    parityDiffImageState === "ready" ? "true" : "false"
                  }
                  data-preview-ready={
                    parityDiffPreviewLoaded ? "true" : "false"
                  }
                  className="grid h-[420px] gap-3 overflow-hidden border bg-white p-4"
                >
                  <div className="text-sm text-muted-foreground">
                    The diff below comes from the latest Playwright parity run.
                    Re-run the parity snapshot test to refresh it after styling
                    changes or after changing the live resolution scale above.
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 border"
                        style={{ backgroundColor: PARITY_MONACO_DIFF_COLOR }}
                      />
                      <span>Monaco darker / extra</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 border"
                        style={{ backgroundColor: PARITY_PROSEMARK_DIFF_COLOR }}
                      />
                      <span>ProseMark darker / extra</span>
                    </div>
                    <div>Paler pixels mean smaller mismatches.</div>
                    <div>More saturated pixels mean larger mismatches.</div>
                  </div>
                  <div
                    data-testid="file-view-code-parity-bounds-delta"
                    className="text-xs text-muted-foreground"
                  >
                    {boundsMetricsState === "loading"
                      ? "Foreground bounds pending"
                      : boundsMetricsState === "error" || !boundsMetrics
                        ? "Foreground bounds unavailable"
                        : `Foreground bounds delta: x ${boundsMetrics.deltaX}px, y ${boundsMetrics.deltaY}px`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {boundsMetricsState === "ready" && boundsMetrics
                      ? `Recorded from ${boundsMetrics.captureScale}x source-resolution captures for this diff artifact.`
                      : "Recorded source resolution pending"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    These bounds ignore the shell border and focus on the first
                    non-background editor pixels, so use them for placement. The
                    pixel diff below still includes rasterization and
                    syntax-color noise, but the color strength now reflects how
                    large each mismatch is. The resolution slider affects the
                    live editors above, while the recorded diff stays on the
                    last parity run until it is regenerated.
                  </div>
                  <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto border bg-white p-4">
                    <img
                      alt="Latest recorded parity pixel diff"
                      src={parityDiffPreviewUrl ?? parityDiffUrl}
                      className="block max-w-none"
                      style={{ imageRendering: "pixelated" }}
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
