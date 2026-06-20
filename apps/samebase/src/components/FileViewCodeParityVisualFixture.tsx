import { useEffect, useRef, useState, type RefObject } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { toCanvas } from "html-to-image";
import { prosemarkBaseThemeSetup, prosemarkBasicSetup } from "@prosemark/core";
import { useTheme } from "next-themes";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import { Input } from "@/components/ui/input";
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
const PARITY_EDITOR_RESOLUTION_SCALE_DEFAULT = 1;
const PARITY_EDITOR_RESOLUTION_SCALE_MAX = 4;
const PARITY_EDITOR_RESOLUTION_SCALE_MIN = 1;
const PARITY_MONACO_DIFF_COLOR = "#ff3b30";
const PARITY_PROSEMARK_DIFF_COLOR = "#007aff";
const PARITY_BACKGROUND_COLOR_DELTA_THRESHOLD = 18;
const PARITY_DIFF_PREVIEW_PADDING_PX = 12;
const PARITY_LIVE_DIFF_INTENSITY_THRESHOLD = 0.045;
const PARITY_MAX_RGBA_DELTA_DISTANCE = Math.hypot(255, 255, 255, 255);

type ParityBackgroundColor = {
  blue: number;
  green: number;
  red: number;
};

type ParityDiffColorChannels = {
  blue: number;
  green: number;
  red: number;
};

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

type ParityLiveDiffResult = {
  mismatchPixels: number;
  previewUrl: string;
};

function clampParityEditorResolutionScale(value: number) {
  return Math.min(
    PARITY_EDITOR_RESOLUTION_SCALE_MAX,
    Math.max(PARITY_EDITOR_RESOLUTION_SCALE_MIN, Math.round(value)),
  );
}

function getParityDiffColorChannels(color: `#${string}`): ParityDiffColorChannels {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return { blue, green, red };
}

const PARITY_MONACO_DIFF_CHANNELS = getParityDiffColorChannels(PARITY_MONACO_DIFF_COLOR);
const PARITY_PROSEMARK_DIFF_CHANNELS = getParityDiffColorChannels(PARITY_PROSEMARK_DIFF_COLOR);

function scaleParityForegroundBounds(
  bounds: ParityForegroundBounds,
  scale: number,
): ParityForegroundBounds {
  return {
    height: bounds.height / scale,
    maxX: bounds.maxX / scale,
    maxY: bounds.maxY / scale,
    minX: bounds.minX / scale,
    minY: bounds.minY / scale,
    width: bounds.width / scale,
  };
}

function measureParityForegroundBounds(args: {
  backgroundColor: ParityBackgroundColor;
  data: Uint8ClampedArray;
  height: number;
  width: number;
}) {
  if (args.width === 0 || args.height === 0) {
    return null;
  }

  let minX = args.width;
  let minY = args.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < args.height; y += 1) {
    for (let x = 0; x < args.width; x += 1) {
      const index = (y * args.width + x) * 4;
      const red = args.data[index];
      const green = args.data[index + 1];
      const blue = args.data[index + 2];
      const alpha = args.data[index + 3];
      const backgroundDelta = Math.hypot(
        red - args.backgroundColor.red,
        green - args.backgroundColor.green,
        blue - args.backgroundColor.blue,
      );
      const isBackground =
        alpha === 0 || backgroundDelta <= PARITY_BACKGROUND_COLOR_DELTA_THRESHOLD;

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
    height: args.height,
    maxX,
    maxY,
    minX,
    minY,
    width: args.width,
  };
}

function sampleParityCanvasBackgroundColor(canvas: HTMLCanvasElement) {
  if (canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const samplePoints = [
    [0, 0],
    [canvas.width - 1, 0],
    [0, canvas.height - 1],
    [canvas.width - 1, canvas.height - 1],
  ] as const;
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;

  for (const [x, y] of samplePoints) {
    const pixel = context.getImageData(x, y, 1, 1).data;
    totalRed += pixel[0];
    totalGreen += pixel[1];
    totalBlue += pixel[2];
  }

  return {
    blue: Math.round(totalBlue / samplePoints.length),
    green: Math.round(totalGreen / samplePoints.length),
    red: Math.round(totalRed / samplePoints.length),
  } satisfies ParityBackgroundColor;
}

function measureParityCanvasForegroundBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const backgroundColor = sampleParityCanvasBackgroundColor(canvas);
  if (!backgroundColor) {
    return null;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return measureParityForegroundBounds({
    backgroundColor,
    data: imageData.data,
    height: canvas.height,
    width: canvas.width,
  });
}

function getParityPixelDiffIntensity(args: {
  actualData: Uint8ClampedArray;
  expectedData: Uint8ClampedArray;
  index: number;
}) {
  const redDelta = Math.abs(args.expectedData[args.index] - args.actualData[args.index]);
  const greenDelta = Math.abs(args.expectedData[args.index + 1] - args.actualData[args.index + 1]);
  const blueDelta = Math.abs(args.expectedData[args.index + 2] - args.actualData[args.index + 2]);
  const alphaDelta = Math.abs(args.expectedData[args.index + 3] - args.actualData[args.index + 3]);
  const normalizedDelta =
    Math.hypot(redDelta, greenDelta, blueDelta, alphaDelta) / PARITY_MAX_RGBA_DELTA_DISTANCE;

  return normalizedDelta === 0 ? 0 : Math.sqrt(normalizedDelta);
}

function getParityPixelLuminance(data: Uint8ClampedArray, index: number) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function blendParityDiffChannel(baseChannel: number, intensity: number) {
  return Math.round(255 - (255 - baseChannel) * intensity);
}

function buildParityDiffPreviewUrl(args: {
  bounds: ParityForegroundBounds | null;
  canvas: HTMLCanvasElement;
}) {
  if (args.canvas.width === 0 || args.canvas.height === 0) {
    return null;
  }

  if (!args.bounds) {
    return args.canvas.toDataURL("image/png");
  }

  const cropMinX = Math.max(0, args.bounds.minX - PARITY_DIFF_PREVIEW_PADDING_PX);
  const cropMinY = Math.max(0, args.bounds.minY - PARITY_DIFF_PREVIEW_PADDING_PX);
  const cropMaxX = Math.min(
    args.canvas.width - 1,
    args.bounds.maxX + PARITY_DIFF_PREVIEW_PADDING_PX,
  );
  const cropMaxY = Math.min(
    args.canvas.height - 1,
    args.bounds.maxY + PARITY_DIFF_PREVIEW_PADDING_PX,
  );
  const cropWidth = cropMaxX - cropMinX + 1;
  const cropHeight = cropMaxY - cropMinY + 1;
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = cropWidth;
  previewCanvas.height = cropHeight;
  const previewContext = previewCanvas.getContext("2d");
  if (!previewContext) {
    return null;
  }

  previewContext.imageSmoothingEnabled = false;
  previewContext.drawImage(
    args.canvas,
    cropMinX,
    cropMinY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return previewCanvas.toDataURL("image/png");
}

async function waitForParitySurfaceStability() {
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function buildLiveParityDiff(args: {
  actualCanvas: HTMLCanvasElement;
  expectedCanvas: HTMLCanvasElement;
}) {
  const compareWidth = Math.min(args.expectedCanvas.width, args.actualCanvas.width);
  const compareHeight = Math.min(args.expectedCanvas.height, args.actualCanvas.height);
  const expectedContext = args.expectedCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  const actualContext = args.actualCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!expectedContext || !actualContext) {
    throw new Error("Missing parity canvas context.");
  }

  const expectedData = expectedContext.getImageData(0, 0, compareWidth, compareHeight).data;
  const actualData = actualContext.getImageData(0, 0, compareWidth, compareHeight).data;
  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = compareWidth;
  diffCanvas.height = compareHeight;
  const diffContext = diffCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!diffContext) {
    throw new Error("Missing parity diff context.");
  }

  const diffImage = diffContext.createImageData(compareWidth, compareHeight);
  let mismatchPixels = 0;
  let minX = compareWidth;
  let minY = compareHeight;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < diffImage.data.length; index += 4) {
    const intensity = getParityPixelDiffIntensity({
      actualData,
      expectedData,
      index,
    });

    if (intensity < PARITY_LIVE_DIFF_INTENSITY_THRESHOLD) {
      diffImage.data[index] = 255;
      diffImage.data[index + 1] = 255;
      diffImage.data[index + 2] = 255;
      diffImage.data[index + 3] = 255;
      continue;
    }

    const x = (index / 4) % compareWidth;
    const y = Math.floor(index / 4 / compareWidth);
    mismatchPixels += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    const monacoDominates =
      getParityPixelLuminance(expectedData, index) <= getParityPixelLuminance(actualData, index);
    const channels = monacoDominates ? PARITY_MONACO_DIFF_CHANNELS : PARITY_PROSEMARK_DIFF_CHANNELS;

    diffImage.data[index] = blendParityDiffChannel(channels.red, intensity);
    diffImage.data[index + 1] = blendParityDiffChannel(channels.green, intensity);
    diffImage.data[index + 2] = blendParityDiffChannel(channels.blue, intensity);
    diffImage.data[index + 3] = 255;
  }

  diffContext.putImageData(diffImage, 0, 0);
  const previewUrl = buildParityDiffPreviewUrl({
    bounds:
      mismatchPixels === 0
        ? null
        : {
            height: compareHeight,
            maxX,
            maxY,
            minX,
            minY,
            width: compareWidth,
          },
    canvas: diffCanvas,
  });
  if (!previewUrl) {
    throw new Error("Missing live parity preview.");
  }

  return {
    mismatchPixels,
    previewUrl,
  } satisfies ParityLiveDiffResult;
}

function StaticCodeMirrorParitySurface({
  captureRef,
  filePath,
  onLanguageReadyChange,
  value,
}: {
  captureRef: RefObject<HTMLDivElement | null>;
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
          languageCompartment.of(getInitialCodeMirrorLanguageExtension(filePath)),
          prosemarkBasicSetup(),
          prosemarkBaseThemeSetup(),
          themeCompartment.of(getProsemarkFileThemeExtensions({ isDark, languageKind })),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    pendingLanguageLoadRef.current = languageLoadKey;

    void loadCodeMirrorLanguageExtension(filePath)
      .then((languageExtension) => {
        if (pendingLanguageLoadRef.current !== languageLoadKey || viewRef.current !== view) {
          return;
        }

        pendingLanguageLoadRef.current = null;
        view.dispatch({
          effects: languageCompartment.reconfigure(languageExtension),
        });
        setLanguageReady(true);
        onLanguageReadyChange(true);
      })
      .catch(() => {
        if (pendingLanguageLoadRef.current !== languageLoadKey || viewRef.current !== view) {
          return;
        }

        // The fixture already mounted with the synchronous fallback language
        // extension, so treat lazy-loader failures as non-fatal and keep the
        // parity surface measurable instead of hanging the readiness gate.
        pendingLanguageLoadRef.current = null;
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
        ref={captureRef}
        data-testid="file-view-code-parity-prosemark-capture"
        className="h-full min-h-0 w-full"
      >
        <div ref={containerRef} className="h-full min-h-0 w-full" />
      </div>
    </div>
  );
}

export function FileViewCodeParityVisualFixture({
  mode: _mode,
}: {
  mode: FileViewCodeParityVisualMode;
}) {
  const monacoCaptureRef = useRef<HTMLDivElement>(null);
  const prosemarkCaptureRef = useRef<HTMLDivElement>(null);
  const [liveDiffRefreshKey, setLiveDiffRefreshKey] = useState(0);
  const [boundsMetrics, setBoundsMetrics] = useState<ParityForegroundBoundsMetrics | null>(null);
  const [boundsMetricsState, setBoundsMetricsState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [monacoReady, setMonacoReady] = useState(false);
  const [prosemarkReady, setProsemarkReady] = useState(false);
  const [editorResolutionScale, setEditorResolutionScale] = useState(
    PARITY_EDITOR_RESOLUTION_SCALE_DEFAULT,
  );
  const [liveMismatchPixels, setLiveMismatchPixels] = useState<number | null>(null);
  const [parityDiffImageState, setParityDiffImageState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [parityDiffPreviewUrl, setParityDiffPreviewUrl] = useState<string | null>(null);
  const [parityDiffPreviewLoaded, setParityDiffPreviewLoaded] = useState(false);

  useEffect(() => {
    const onRefreshArtifacts = () => {
      setLiveDiffRefreshKey((currentValue) => currentValue + 1);
    };

    window.addEventListener("file-view-code-parity-refresh-artifacts", onRefreshArtifacts);

    return () => {
      window.removeEventListener("file-view-code-parity-refresh-artifacts", onRefreshArtifacts);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const shouldIgnoreResult = () => cancelled;
    setBoundsMetricsState("loading");
    setBoundsMetrics(null);
    setLiveMismatchPixels(null);
    setParityDiffImageState("loading");
    setParityDiffPreviewLoaded(false);
    setParityDiffPreviewUrl(null);

    if (
      !monacoReady ||
      !prosemarkReady ||
      !(monacoCaptureRef.current instanceof HTMLDivElement) ||
      !(prosemarkCaptureRef.current instanceof HTMLDivElement)
    ) {
      return () => {
        cancelled = true;
      };
    }

    void waitForParitySurfaceStability()
      .then(async () => {
        if (shouldIgnoreResult()) {
          return;
        }

        const monacoCaptureNode = monacoCaptureRef.current;
        const prosemarkCaptureNode = prosemarkCaptureRef.current;
        if (!monacoCaptureNode || !prosemarkCaptureNode) {
          throw new Error("Missing parity capture node.");
        }

        const monacoRect = monacoCaptureNode.getBoundingClientRect();
        const prosemarkRect = prosemarkCaptureNode.getBoundingClientRect();
        const captureWidth = Math.round(Math.min(monacoRect.width, prosemarkRect.width));
        const captureHeight = Math.round(Math.min(monacoRect.height, prosemarkRect.height));
        const captureScale = clampParityEditorResolutionScale(editorResolutionScale);
        if (captureWidth === 0 || captureHeight === 0) {
          throw new Error("Missing parity capture size.");
        }

        const captureOptions = {
          backgroundColor: "#ffffff",
          cacheBust: true,
          canvasHeight: captureHeight * captureScale,
          canvasWidth: captureWidth * captureScale,
          pixelRatio: 1,
          skipAutoScale: true,
          style:
            captureScale === 1
              ? undefined
              : {
                  transform: `scale(${captureScale})`,
                  transformOrigin: "top left",
                },
        };
        const [monacoCanvas, prosemarkCanvas] = await Promise.all([
          toCanvas(monacoCaptureNode, captureOptions),
          toCanvas(prosemarkCaptureNode, captureOptions),
        ]);
        if (shouldIgnoreResult()) {
          return;
        }

        const monacoBounds = measureParityCanvasForegroundBounds(monacoCanvas);
        const prosemarkBounds = measureParityCanvasForegroundBounds(prosemarkCanvas);
        const nextBoundsMetrics =
          monacoBounds && prosemarkBounds
            ? {
                actual: {
                  bounds: scaleParityForegroundBounds(prosemarkBounds, captureScale),
                  label: "ProseMark",
                },
                captureScale,
                deltaX: (prosemarkBounds.minX - monacoBounds.minX) / captureScale,
                deltaY: (prosemarkBounds.minY - monacoBounds.minY) / captureScale,
                expected: {
                  bounds: scaleParityForegroundBounds(monacoBounds, captureScale),
                  label: "Monaco",
                },
              }
            : null;
        const liveDiff = buildLiveParityDiff({
          actualCanvas: prosemarkCanvas,
          expectedCanvas: monacoCanvas,
        });

        if (shouldIgnoreResult()) {
          return;
        }

        setBoundsMetrics(nextBoundsMetrics);
        setBoundsMetricsState(nextBoundsMetrics ? "ready" : "error");
        setLiveMismatchPixels(liveDiff.mismatchPixels);
        setParityDiffImageState("ready");
        setParityDiffPreviewUrl(liveDiff.previewUrl);
      })
      .catch(() => {
        if (shouldIgnoreResult()) {
          return;
        }

        setBoundsMetrics(null);
        setBoundsMetricsState("error");
        setLiveMismatchPixels(null);
        setParityDiffImageState("error");
        setParityDiffPreviewUrl(null);
        setParityDiffPreviewLoaded(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editorResolutionScale, liveDiffRefreshKey, monacoReady, prosemarkReady]);

  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="file-view-code-parity-visual-fixture"
      left={{
        header: null,
        content: (
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
        ),
      }}
      main={{
        headerAccessory: (
          <RepositoryWorkspacePaneHeader
            title={FIXTURE_FILE_PATH}
            right={<div className="font-mono text-xs text-muted-foreground">2489719</div>}
            onQuickOpen={() => {}}
          />
        ),
        content: (
          <div className="flex flex-col bg-muted/10">
            <div className="border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
              Monaco line numbers are temporarily disabled so the parity diff can focus on
              typography, spacing, and syntax color.
            </div>
            <div className="p-3">
              <div className="grid gap-4">
                {/* Keep the parity capture area bounded so 2x live diff refreshes stay fast in CI. */}
                <div
                  data-testid="file-view-code-parity-editor-panels"
                  className="grid max-w-[960px] gap-4 xl:grid-cols-2"
                >
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
                        ref={monacoCaptureRef}
                        data-testid="file-view-code-parity-monaco-capture"
                        className="h-full min-h-0 w-full"
                      >
                        <MonacoEditorSurface
                          branch="main"
                          defaultValue={FIXTURE_DOCUMENT}
                          disableFolding={true}
                          disableLineNumbers={true}
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

                  <div className="corner-notch-1 border bg-background p-3">
                    <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      ProseMark
                    </div>
                    <StaticCodeMirrorParitySurface
                      captureRef={prosemarkCaptureRef}
                      filePath={FIXTURE_FILE_PATH}
                      onLanguageReadyChange={setProsemarkReady}
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
                        <label htmlFor="file-view-code-parity-resolution-scale">Resolution</label>
                        <input
                          aria-label="Parity resolution scale"
                          type="range"
                          min={PARITY_EDITOR_RESOLUTION_SCALE_MIN}
                          max={PARITY_EDITOR_RESOLUTION_SCALE_MAX}
                          step={1}
                          value={editorResolutionScale}
                          onChange={(event) => {
                            setEditorResolutionScale(
                              clampParityEditorResolutionScale(Number(event.currentTarget.value)),
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

                            setEditorResolutionScale(clampParityEditorResolutionScale(nextValue));
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
                          ? "Rendering live diff..."
                          : parityDiffImageState === "error"
                            ? "Live diff unavailable"
                            : liveMismatchPixels === null
                              ? "Live pixel diff"
                              : `${liveMismatchPixels.toLocaleString()} live mismatches`}
                      </div>
                    </div>
                  </div>
                  <div
                    data-testid="file-view-code-parity-diff"
                    data-diff-ready={parityDiffImageState === "ready" ? "true" : "false"}
                    data-preview-ready={parityDiffPreviewLoaded ? "true" : "false"}
                    className="grid gap-3 border bg-white p-4"
                  >
                    <div className="text-sm text-muted-foreground">
                      The diff below is generated from the current live Monaco and ProseMark
                      surfaces, so changing the resolution control above updates it immediately.
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
                          style={{
                            backgroundColor: PARITY_PROSEMARK_DIFF_COLOR,
                          }}
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
                        ? `Live diff captured at ${boundsMetrics.captureScale}x resolution.`
                        : "Live capture resolution pending"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      These bounds ignore the shell border and focus on the first non-background
                      editor pixels, so use them for placement. The pixel diff below still includes
                      rasterization and syntax-color noise, but the color strength now reflects how
                      large each mismatch is.
                    </div>
                    <div
                      data-testid="file-view-code-parity-diff-preview"
                      className="overflow-visible border bg-white p-4"
                    >
                      <div className="w-fit">
                        <img
                          alt="Live parity pixel diff"
                          src={parityDiffPreviewUrl ?? undefined}
                          className="block max-w-none"
                          style={{ imageRendering: "pixelated" }}
                          onLoad={() => {
                            setParityDiffPreviewLoaded(true);
                          }}
                          onError={() => {
                            setParityDiffPreviewLoaded(false);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      }}
      right={{
        content: (
          <div className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Goal
            </div>
            <div className="grid gap-2 p-3 text-sm text-muted-foreground">
              <div>Match CodeMirror to Monaco styling.</div>
              <div>
                Compare the same TypeScript file in both editors and the current live pixel diff.
              </div>
            </div>
          </div>
        ),
      }}
    />
  );
}
