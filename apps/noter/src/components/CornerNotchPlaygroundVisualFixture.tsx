import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { z } from "zod";
import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import { Button } from "@/components/ui/button";
import { useCornerNotchBridgeColor } from "@/hooks/useCornerNotchBridgeColor";
import {
  CORNER_NOTCH_TYPES,
  DEFAULT_CORNER_NOTCH_TYPE,
  getCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { cn } from "@/lib/utils";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { Chrome } from "lucide-react";

export type CornerNotchPlaygroundVisualMode = "corner-notch-playground";

const PLAYGROUND_BORDER_WIDTHS = [1, 2, 3, 4] as const;
const PLAYGROUND_ZOOMS = [8, 12, 16] as const;
const PLAYGROUND_SURFACES = ["light", "dark", "warm"] as const;

type PlaygroundBorderWidth = (typeof PLAYGROUND_BORDER_WIDTHS)[number];
type PlaygroundZoom = (typeof PLAYGROUND_ZOOMS)[number];
type PlaygroundSurface = (typeof PLAYGROUND_SURFACES)[number];

type CornerNotchFixtureStyle = CSSProperties & {
  "--noter-corner-notch-bridge-size"?: string;
  "--noter-corner-notch-stroke"?: string;
};

const SURFACE_FRAME_CLASS = {
  light: "border-stone-300 bg-white text-stone-950",
  dark: "border-stone-700 bg-stone-950 text-stone-50",
  warm: "border-amber-200 bg-amber-50 text-stone-900",
} as const satisfies Record<PlaygroundSurface, string>;

const DETAIL_BOX_SIZE = 20;

type FixtureLocationLike = {
  hash: string;
  pathname: string;
  searchStr: string;
};

function isOneOf<const T extends readonly string[] | readonly number[]>(
  values: T,
  candidate: unknown,
): candidate is T[number] {
  return values.some((value) => value === candidate);
}

function readOptionalNumberParam<T extends readonly number[]>(
  value: unknown,
  values: T,
  fallback: T[number],
): T[number] {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return values.find((value) => value === parsedValue) ?? fallback;
}

function readOptionalStringParam<T extends readonly string[]>(
  value: unknown,
  values: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string"
    ? (values.find((candidate) => candidate === value) ?? fallback)
    : fallback;
}

function createLiteralNumberParamSchema<const T extends readonly number[]>(
  values: T,
  fallback: T[number],
) {
  return z.preprocess(
    (value) => readOptionalNumberParam(value, values, fallback),
    z.custom<T[number]>((value) => isOneOf(values, value)),
  );
}

function createLiteralStringParamSchema<const T extends readonly string[]>(
  values: T,
  fallback: T[number],
) {
  return z.preprocess(
    (value) => readOptionalStringParam(value, values, fallback),
    z.custom<T[number]>((value) => isOneOf(values, value)),
  );
}

const cornerNotchPlaygroundSearchSchema = z.object({
  borderWidth: createLiteralNumberParamSchema(PLAYGROUND_BORDER_WIDTHS, 2),
  surface: createLiteralStringParamSchema(PLAYGROUND_SURFACES, "light"),
  type: createLiteralNumberParamSchema(
    CORNER_NOTCH_TYPES,
    DEFAULT_CORNER_NOTCH_TYPE,
  ),
  zoom: createLiteralNumberParamSchema(PLAYGROUND_ZOOMS, 12),
});

type CornerNotchPlaygroundSearch = z.infer<
  typeof cornerNotchPlaygroundSearchSchema
>;

function readCornerNotchPlaygroundSearch(
  search: string,
): CornerNotchPlaygroundSearch {
  return cornerNotchPlaygroundSearchSchema.parse(parseTanStackSearch(search));
}

function buildFixtureHref(
  location: FixtureLocationLike,
  name: "type" | "borderWidth" | "zoom" | "surface",
  value: number | string,
) {
  return buildPathWithUpdatedQuery(
    {
      hash: location.hash,
      pathname: location.pathname,
      search: location.searchStr,
    },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, "mode", "corner-notch-playground");
      setQueryParam(nextSearchParams, name, `${value}`);
    },
  );
}

function buildFixtureModeHref(
  location: FixtureLocationLike,
  mode: "corner-notch" | "corner-notch-detail",
) {
  return buildPathWithUpdatedQuery(
    {
      hash: location.hash,
      pathname: location.pathname,
      search: location.searchStr,
    },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, "mode", mode);
    },
  );
}

function FixtureOptionLink({
  href,
  isSelected,
  label,
}: {
  href: string;
  isSelected: boolean;
  label: string;
}) {
  return (
    <a
      className={cn(
        "corner-notch-1 border px-2 py-1 text-xs transition-colors",
        isSelected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      href={href}
    >
      {label}
    </a>
  );
}

function FixtureControlRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function createRawSurfaceStyle(
  borderWidth: PlaygroundBorderWidth,
  missingSide?: "bottom" | "right",
): CornerNotchFixtureStyle {
  const pixels = `${borderWidth}px`;
  const style: CornerNotchFixtureStyle = {
    borderBottomWidth: pixels,
    borderLeftWidth: pixels,
    borderRightWidth: pixels,
    borderTopWidth: pixels,
    "--noter-corner-notch-bridge-size": pixels,
    "--noter-corner-notch-stroke": pixels,
  };

  if (missingSide === "right") {
    style.borderRightWidth = "0px";
  }

  if (missingSide === "bottom") {
    style.borderBottomWidth = "0px";
  }

  return style;
}

function createComponentSurfaceStyle(
  borderWidth: PlaygroundBorderWidth,
): CornerNotchFixtureStyle {
  const pixels = `${borderWidth}px`;

  return {
    borderWidth: pixels,
    "--noter-corner-notch-stroke": pixels,
  };
}

function RawNotchElement({
  borderWidth,
  className,
  missingSide,
  type,
  zoom,
}: {
  borderWidth: PlaygroundBorderWidth;
  className?: string;
  missingSide?: "bottom" | "right";
  type: CornerNotchType;
  zoom: PlaygroundZoom;
}) {
  const bridgeRef = useCornerNotchBridgeColor(type, null);

  return (
    <div
      ref={bridgeRef}
      className={cn(
        "box-border border border-stone-500 bg-white",
        getCornerNotchClass(type),
        className,
      )}
      style={{
        ...createRawSurfaceStyle(borderWidth, missingSide),
        backgroundClip: "padding-box",
        backgroundImage: [
          "repeating-conic-gradient(from 90deg, rgb(120 113 108 / 0.12) 0deg 25%, transparent 0deg 50%)",
          "repeating-linear-gradient(to right, transparent 0 4px, rgb(120 113 108 / 0.32) 4px 5px)",
          "repeating-linear-gradient(to bottom, transparent 0 4px, rgb(120 113 108 / 0.32) 4px 5px)",
        ].join(", "),
        backgroundPosition: "top left, top left, top left",
        backgroundSize: "2px 2px, 5px 100%, 100% 5px",
        height: DETAIL_BOX_SIZE,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
        width: DETAIL_BOX_SIZE,
      }}
    />
  );
}

function RawNotchPreview({
  borderWidth,
  className,
  label,
  missingSide,
  type,
  zoom,
}: {
  borderWidth: PlaygroundBorderWidth;
  className?: string;
  label: string;
  missingSide?: "bottom" | "right";
  type: CornerNotchType;
  zoom: PlaygroundZoom;
}) {
  return (
    <div className="grid gap-2 border border-stone-300 bg-white p-3">
      <div className="text-xs text-stone-600">{label}</div>
      <div className="w-fit border border-stone-300 bg-stone-200 p-3">
        <div
          style={{
            height: DETAIL_BOX_SIZE * zoom,
            width: DETAIL_BOX_SIZE * zoom,
          }}
        >
          <RawNotchElement
            borderWidth={borderWidth}
            className={className}
            missingSide={missingSide}
            type={type}
            zoom={zoom}
          />
        </div>
      </div>
    </div>
  );
}

function RawNotchPairPreview({
  borderWidth,
  type,
  zoom,
}: {
  borderWidth: PlaygroundBorderWidth;
  type: CornerNotchType;
  zoom: PlaygroundZoom;
}) {
  return (
    <div className="grid gap-2 border border-stone-300 bg-white p-3">
      <div className="text-xs text-stone-600">touching pair</div>
      <div className="w-fit border border-stone-300 bg-stone-200 p-3">
        <div className="flex gap-0">
          {[0, 1].map((index) => (
            <div
              key={index}
              style={{
                height: DETAIL_BOX_SIZE * zoom,
                width: DETAIL_BOX_SIZE * zoom,
              }}
            >
              <RawNotchElement
                borderWidth={borderWidth}
                type={type}
                zoom={zoom}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CornerNotchPlaygroundVisualFixtureContent() {
  const location = useLocation();
  const { borderWidth, surface, type, zoom } = readCornerNotchPlaygroundSearch(
    location.searchStr,
  );
  const selectedType = type;
  const selectedBorderWidth = borderWidth;
  const selectedZoom = zoom;
  const selectedSurface = surface;
  const notchClass = getCornerNotchClass(selectedType);
  const componentSurfaceStyle =
    createComponentSurfaceStyle(selectedBorderWidth);
  const sidebarHeader = (
    <div className="flex h-full items-center px-3 text-sm font-medium text-foreground">
      Noter
    </div>
  );
  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/50 px-3 py-3">
        <div className="text-xs text-muted-foreground">
          Corner notch playground
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Use the left pane as the shared fixture control surface.
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          <code>{`${notchClass} / stroke ${selectedBorderWidth}px / zoom ${selectedZoom}x / ${selectedSurface}`}</code>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3">
        <div className="grid gap-4">
          <FixtureControlRow label="Modes">
            <FixtureOptionLink
              href={buildFixtureHref(location, "type", selectedType)}
              isSelected
              label="playground"
            />
            <FixtureOptionLink
              href={buildFixtureModeHref(location, "corner-notch")}
              isSelected={false}
              label="gallery"
            />
            <FixtureOptionLink
              href={buildFixtureModeHref(location, "corner-notch-detail")}
              isSelected={false}
              label="detail"
            />
          </FixtureControlRow>

          <FixtureControlRow label="Type">
            {CORNER_NOTCH_TYPES.map((type) => (
              <FixtureOptionLink
                key={type}
                href={buildFixtureHref(location, "type", type)}
                isSelected={selectedType === type}
                label={`type ${type}`}
              />
            ))}
          </FixtureControlRow>

          <FixtureControlRow label="Border Width">
            {PLAYGROUND_BORDER_WIDTHS.map((borderWidth) => (
              <FixtureOptionLink
                key={borderWidth}
                href={buildFixtureHref(location, "borderWidth", borderWidth)}
                isSelected={selectedBorderWidth === borderWidth}
                label={`${borderWidth}px`}
              />
            ))}
          </FixtureControlRow>

          <FixtureControlRow label="Zoom">
            {PLAYGROUND_ZOOMS.map((zoom) => (
              <FixtureOptionLink
                key={zoom}
                href={buildFixtureHref(location, "zoom", zoom)}
                isSelected={selectedZoom === zoom}
                label={`${zoom}x`}
              />
            ))}
          </FixtureControlRow>

          <FixtureControlRow label="Surface">
            {PLAYGROUND_SURFACES.map((surface) => (
              <FixtureOptionLink
                key={surface}
                href={buildFixtureHref(location, "surface", surface)}
                isSelected={selectedSurface === surface}
                label={surface}
              />
            ))}
          </FixtureControlRow>
        </div>
      </div>
    </div>
  );
  const mainContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6">
          <section
            data-testid="corner-notch-playground-product"
            className="grid gap-4"
          >
            <div
              className={cn(
                "flex min-h-[280px] items-center justify-center border p-6",
                SURFACE_FRAME_CLASS[selectedSurface],
              )}
            >
              <Button
                cornerNotch={selectedType}
                type="button"
                variant="outline"
                className="w-full max-w-60 sm:w-auto"
                style={componentSurfaceStyle}
              >
                <Chrome className="mr-2 h-4 w-4" /> Google
              </Button>
            </div>
          </section>

          <section
            data-testid="corner-notch-playground-detail"
            className="grid gap-4"
          >
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
              <RawNotchPreview
                borderWidth={selectedBorderWidth}
                label="single"
                type={selectedType}
                zoom={selectedZoom}
              />

              <RawNotchPairPreview
                borderWidth={selectedBorderWidth}
                type={selectedType}
                zoom={selectedZoom}
              />

              <RawNotchPreview
                borderWidth={selectedBorderWidth}
                className="border-r-0"
                label="border-r-0"
                missingSide="right"
                type={selectedType}
                zoom={selectedZoom}
              />

              <RawNotchPreview
                borderWidth={selectedBorderWidth}
                className="border-b-0"
                label="border-b-0"
                missingSide="bottom"
                type={selectedType}
                zoom={selectedZoom}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="corner-notch-playground-visual-fixture"
      defaultOpen={true}
      defaultRightOpen={false}
      left={{
        header: sidebarHeader,
        content: sidebarContent,
      }}
      main={{
        header: <RepositoryWorkspacePaneHeader title="SignInWithGoogle.tsx" />,
        content: mainContent,
      }}
      right={{}}
    />
  );
}

export function CornerNotchPlaygroundVisualFixture() {
  return (
    <TestRouterProvider
      initialEntries={[
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      ]}
    >
      <CornerNotchPlaygroundVisualFixtureContent />
    </TestRouterProvider>
  );
}
