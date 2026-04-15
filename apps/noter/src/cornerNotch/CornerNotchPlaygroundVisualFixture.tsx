import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { z } from "zod";
import { Input } from "@/components/input";
import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import { Button } from "@/components/ui/button";
import {
  CORNER_NOTCH_TYPES,
  DEFAULT_CORNER_NOTCH_TYPE,
} from "@/cornerNotch/cornerNotch";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { cn } from "@/lib/utils";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { Chrome } from "lucide-react";

export type CornerNotchPlaygroundVisualMode = "corner-notch-playground";

const PLAYGROUND_BORDER_WIDTHS = [1, 2, 3, 4] as const;
const PLAYGROUND_ZOOMS = [1, 2, 4, 6, 8, 10] as const;
const PLAYGROUND_SURFACES = ["light", "dark", "warm"] as const;

type PlaygroundBorderWidth = (typeof PLAYGROUND_BORDER_WIDTHS)[number];
type PlaygroundSurface = (typeof PLAYGROUND_SURFACES)[number];

type CornerNotchFixtureStyle = CSSProperties & {
  "--noter-corner-notch-preview-focus-step"?: string;
};

const SURFACE_FRAME_CLASS = {
  light: "border-stone-300 bg-white text-stone-950",
  dark: "border-stone-700 bg-stone-950 text-stone-50",
  warm: "border-amber-200 bg-amber-50 text-stone-900",
} as const satisfies Record<PlaygroundSurface, string>;

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
  zoom: createLiteralNumberParamSchema(PLAYGROUND_ZOOMS, 2),
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
  name: "type" | "borderWidth" | "zoom" | "surface",
  value: number | string,
) {
  return buildPathWithUpdatedQuery(
    {
      hash: window.location.hash,
      pathname: window.location.pathname,
      search: window.location.search,
    },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, "mode", "corner-notch-playground");
      setQueryParam(nextSearchParams, "family", null);
      setQueryParam(nextSearchParams, name, `${value}`);
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

function createComponentSurfaceStyle(
  borderWidth: PlaygroundBorderWidth,
  zoom: number,
): CornerNotchFixtureStyle {
  const pixels = `${borderWidth}px`;

  return {
    borderWidth: pixels,
    "--noter-corner-notch-preview-focus-step": `${1 / zoom}px`,
  };
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
  const componentSurfaceStyle = createComponentSurfaceStyle(
    selectedBorderWidth,
    selectedZoom,
  );
  const zoomedSurfaceStyle: CSSProperties = {
    transform: `scale(${selectedZoom})`,
    transformOrigin: "center",
  };
  const sidebarHeader = (
    <div className="text-md p-2">Corner notch playground</div>
  );
  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-auto px-3 py-3">
        <div className="grid gap-4">
          <FixtureControlRow label="Type">
            {CORNER_NOTCH_TYPES.map((type) => (
              <FixtureOptionLink
                key={type}
                href={buildFixtureHref("type", type)}
                isSelected={selectedType === type}
                label={`type ${type}`}
              />
            ))}
          </FixtureControlRow>

          <FixtureControlRow label="Border Width">
            {PLAYGROUND_BORDER_WIDTHS.map((borderWidth) => (
              <FixtureOptionLink
                key={borderWidth}
                href={buildFixtureHref("borderWidth", borderWidth)}
                isSelected={selectedBorderWidth === borderWidth}
                label={`${borderWidth}px`}
              />
            ))}
          </FixtureControlRow>

          <FixtureControlRow label="Zoom">
            {PLAYGROUND_ZOOMS.map((zoom) => (
              <FixtureOptionLink
                key={zoom}
                href={buildFixtureHref("zoom", zoom)}
                isSelected={selectedZoom === zoom}
                label={`${zoom}x`}
              />
            ))}
          </FixtureControlRow>

          <FixtureControlRow label="Surface">
            {PLAYGROUND_SURFACES.map((surface) => (
              <FixtureOptionLink
                key={surface}
                href={buildFixtureHref("surface", surface)}
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
    <section
      data-testid="corner-notch-playground-product"
      className={cn(
        "h-full overflow-auto p-8",
        SURFACE_FRAME_CLASS[selectedSurface],
      )}
    >
      <div
        className="flex flex-col min-h-full items-center justify-center gap-2 "
        style={zoomedSurfaceStyle}
      >
        <Button
          cornerNotch={selectedType}
          type="button"
          variant="outline"
          style={componentSurfaceStyle}
        >
          <Chrome className="mr-2 h-4 w-4" /> G
        </Button>

        <Input
          className="w-24"
          cornerNotch={selectedType}
          style={componentSurfaceStyle}
        />
      </div>
    </section>
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
        header: <RepositoryWorkspacePaneHeader title="SignInForm.tsx" />,
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
