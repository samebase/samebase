import type { CSSProperties, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { Input } from "@/components/input";
import { Button } from "@/components/ui/button";
import { useCornerNotchBridgeColor } from "@/hooks/useCornerNotchBridgeColor";
import {
  CORNER_NOTCH_TYPES,
  DEFAULT_CORNER_NOTCH_TYPE,
  getCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { cn } from "@/lib/utils";

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

const SURFACE_SWATCH_CLASS = {
  light: "border-stone-300 bg-stone-100 text-stone-900",
  dark: "border-stone-600 bg-stone-900 text-stone-50",
  warm: "border-amber-300 bg-amber-100 text-stone-900",
} as const satisfies Record<PlaygroundSurface, string>;

const DETAIL_BOX_SIZE = 20;

function readNumberParam<T extends readonly number[]>(
  name: string,
  values: T,
  fallback: T[number],
): T[number] {
  const rawValue = new URLSearchParams(window.location.search).get(name);
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return values.find((value) => value === parsedValue) ?? fallback;
}

function readStringParam<T extends readonly string[]>(
  name: string,
  values: T,
  fallback: T[number],
): T[number] {
  const rawValue = new URLSearchParams(window.location.search).get(name);
  if (!rawValue) {
    return fallback;
  }

  return values.find((value) => value === rawValue) ?? fallback;
}

function buildFixtureHref(
  name: "type" | "borderWidth" | "zoom" | "surface",
  value: number | string,
) {
  return buildPathWithUpdatedQuery(window.location, (nextSearchParams) => {
    setQueryParam(nextSearchParams, "mode", "corner-notch-playground");
    setQueryParam(nextSearchParams, name, `${value}`);
  });
}

function buildFixtureModeHref(mode: "corner-notch" | "corner-notch-detail") {
  return buildPathWithUpdatedQuery(window.location, (nextSearchParams) => {
    setQueryParam(nextSearchParams, "mode", mode);
  });
}

function FixtureBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-none bg-current/45", className)}
    />
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
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
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

export function CornerNotchPlaygroundVisualFixture() {
  const selectedType = readNumberParam(
    "type",
    CORNER_NOTCH_TYPES,
    DEFAULT_CORNER_NOTCH_TYPE,
  );
  const selectedBorderWidth = readNumberParam(
    "borderWidth",
    PLAYGROUND_BORDER_WIDTHS,
    2,
  );
  const selectedZoom = readNumberParam("zoom", PLAYGROUND_ZOOMS, 12);
  const selectedSurface = readStringParam(
    "surface",
    PLAYGROUND_SURFACES,
    "light",
  );
  const notchClass = getCornerNotchClass(selectedType);
  const componentSurfaceStyle =
    createComponentSurfaceStyle(selectedBorderWidth);

  return (
    <div
      data-testid="corner-notch-playground-visual-fixture"
      className="min-h-screen bg-stone-100 p-6 text-stone-950"
    >
      <div className="mx-auto grid max-w-[1600px] gap-6">
        <div className="grid gap-2">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
            Corner Notch
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
          <p className="max-w-3xl text-sm text-stone-600">
            Tune the notch CSS on a real fixture surface, then hop to the
            gallery or detail modes when you want the existing screenshot views.
          </p>
        </div>

        <section className="grid gap-4 border border-stone-300 bg-white p-4">
          <FixtureControlRow label="Modes">
            <FixtureOptionLink
              href={buildFixtureHref("type", selectedType)}
              isSelected
              label="playground"
            />
            <FixtureOptionLink
              href={buildFixtureModeHref("corner-notch")}
              isSelected={false}
              label="gallery"
            />
            <FixtureOptionLink
              href={buildFixtureModeHref("corner-notch-detail")}
              isSelected={false}
              label="detail"
            />
          </FixtureControlRow>

          <div className="grid gap-4 xl:grid-cols-4">
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

          <div className="text-xs text-stone-500">
            <code>{`${notchClass} / stroke ${selectedBorderWidth}px / zoom ${selectedZoom}x / ${selectedSurface}`}</code>
          </div>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <section
            data-testid="corner-notch-playground-product"
            className="grid gap-4 border border-stone-300 bg-white p-4"
          >
            <div className="text-sm font-medium text-stone-900">
              Product surface
            </div>

            <div
              className={cn(
                "grid gap-4 border p-4",
                SURFACE_FRAME_CLASS[selectedSurface],
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <div className="text-xs uppercase tracking-[0.18em] opacity-60">
                    current
                  </div>
                  <div className="text-sm font-medium">
                    {notchClass} with a {selectedBorderWidth}px stroke
                  </div>
                </div>

                <div
                  className={cn(
                    "border px-3 py-1 text-xs",
                    getCornerNotchClass(selectedType),
                    SURFACE_SWATCH_CLASS[selectedSurface],
                  )}
                  style={createRawSurfaceStyle(selectedBorderWidth)}
                >
                  raw swatch
                </div>
              </div>

              <Card
                cornerNotch={selectedType}
                className="shadow-none"
                style={componentSurfaceStyle}
              >
                <CardHeader className="space-y-2">
                  <CardTitle className="text-base">Corner notch card</CardTitle>
                  <FixtureBar className="h-2.5 w-48 bg-current/35" />
                </CardHeader>

                <CardContent className="grid gap-3">
                  <Input
                    cornerNotch={selectedType}
                    readOnly
                    style={componentSurfaceStyle}
                    value="notched input"
                  />

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Input
                      cornerNotch={selectedType}
                      readOnly
                      style={componentSurfaceStyle}
                      value="bridge-color check"
                    />

                    <Button
                      cornerNotch={selectedType}
                      variant="outline"
                      style={componentSurfaceStyle}
                    >
                      Outline
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      cornerNotch={selectedType}
                      className="border border-primary"
                      style={componentSurfaceStyle}
                    >
                      Primary
                    </Button>
                    <Button
                      cornerNotch={selectedType}
                      variant="outline"
                      style={componentSurfaceStyle}
                    >
                      Quiet
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3 md:grid-cols-3">
                <div
                  className={cn(
                    "border p-4",
                    getCornerNotchClass(selectedType),
                    SURFACE_SWATCH_CLASS.light,
                  )}
                  style={createRawSurfaceStyle(selectedBorderWidth)}
                >
                  <div className="text-sm font-medium">light</div>
                </div>

                <div
                  className={cn(
                    "border p-4",
                    getCornerNotchClass(selectedType),
                    SURFACE_SWATCH_CLASS.dark,
                  )}
                  style={createRawSurfaceStyle(selectedBorderWidth)}
                >
                  <div className="text-sm font-medium">dark</div>
                </div>

                <div
                  className={cn(
                    "border p-4",
                    getCornerNotchClass(selectedType),
                    SURFACE_SWATCH_CLASS.warm,
                  )}
                  style={createRawSurfaceStyle(selectedBorderWidth)}
                >
                  <div className="text-sm font-medium">warm</div>
                </div>
              </div>
            </div>
          </section>

          <section
            data-testid="corner-notch-playground-detail"
            className="grid gap-4 border border-stone-300 bg-white p-4"
          >
            <div className="text-sm font-medium text-stone-900">
              Detail surface
            </div>

            <div className="grid gap-3">
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
}
