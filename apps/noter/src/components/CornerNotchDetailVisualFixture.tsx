import { cn } from "@/lib/utils";
import { getCornerNotchClass } from "@/lib/cornerNotch";
import { useCornerNotchBridgeColor } from "@/hooks/useCornerNotchBridgeColor";

type FixtureBorderWidth = 1 | 2;
type FixtureZoom = 1 | 12;
type FixtureConfig = {
  borderWidth: FixtureBorderWidth;
  type: 0 | 1 | 2;
};

const FIXTURE_BOX_SIZE = 16;

const FIXTURE_CONFIGS: FixtureConfig[] = [
  { borderWidth: 1, type: 0 },
  { borderWidth: 1, type: 1 },
  { borderWidth: 1, type: 2 },
  { borderWidth: 2, type: 0 },
  { borderWidth: 2, type: 1 },
  { borderWidth: 2, type: 2 },
];

function FixtureBar({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-none bg-current/50", className)} />;
}

function CornerNotchChipElement({
  borderWidth,
  type,
  zoom,
}: FixtureConfig & {
  zoom: FixtureZoom;
}) {
  const notchClass = getCornerNotchClass(type);
  const bridgeRef = useCornerNotchBridgeColor(type, null);

  return (
    <div
      ref={bridgeRef}
      className={cn(
        "box-border border-stone-500 bg-white",
        borderWidth === 1 ? "border" : "border-2",
        notchClass,
      )}
      style={{
        backgroundClip: "padding-box",
        backgroundImage: [
          "repeating-conic-gradient(from 90deg, rgb(120 113 108 / 0.12) 0deg 25%, transparent 0deg 50%)",
          "repeating-linear-gradient(to right, transparent 0 4px, rgb(120 113 108 / 0.32) 4px 5px)",
          "repeating-linear-gradient(to bottom, transparent 0 4px, rgb(120 113 108 / 0.32) 4px 5px)",
        ].join(", "),
        backgroundPosition: "top left, top left, top left",
        backgroundSize: "2px 2px, 5px 100%, 100% 5px",
        height: FIXTURE_BOX_SIZE,
        transform: zoom === 1 ? undefined : `scale(${zoom})`,
        transformOrigin: zoom === 1 ? undefined : "top left",
        width: FIXTURE_BOX_SIZE,
      }}
    />
  );
}

function CornerNotchChip({
  borderWidth,
  type,
  zoom,
}: FixtureConfig & {
  zoom: FixtureZoom;
}) {
  if (zoom === 1) {
    return (
      <div className="w-fit border border-stone-400 bg-stone-300 p-2">
        <CornerNotchChipElement borderWidth={borderWidth} type={type} zoom={zoom} />
      </div>
    );
  }

  return (
    <div className="w-fit border border-stone-400 bg-stone-300 p-3">
      <div
        style={{
          height: FIXTURE_BOX_SIZE * zoom,
          width: FIXTURE_BOX_SIZE * zoom,
        }}
      >
        <CornerNotchChipElement borderWidth={borderWidth} type={type} zoom={zoom} />
      </div>
    </div>
  );
}

function CornerNotchTouchingPair({
  borderWidth,
  type,
  zoom,
}: FixtureConfig & {
  zoom: FixtureZoom;
}) {
  return (
    <div className="w-fit border border-stone-400 bg-stone-300 p-3">
      <div className="flex gap-0">
        <div
          style={{
            height: FIXTURE_BOX_SIZE * zoom,
            width: FIXTURE_BOX_SIZE * zoom,
          }}
        >
          <CornerNotchChipElement borderWidth={borderWidth} type={type} zoom={zoom} />
        </div>
        <div
          style={{
            height: FIXTURE_BOX_SIZE * zoom,
            width: FIXTURE_BOX_SIZE * zoom,
          }}
        >
          <CornerNotchChipElement borderWidth={borderWidth} type={type} zoom={zoom} />
        </div>
      </div>
    </div>
  );
}

function FixtureTypeMarkers({ type }: { type: FixtureConfig["type"] }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((markerType) => (
        <div
          key={markerType}
          aria-hidden="true"
          className={cn(
            "h-2.5 w-2.5 border border-stone-400",
            markerType <= type ? "bg-stone-700" : "bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

function FixtureBorderMarkers({ borderWidth }: { borderWidth: FixtureBorderWidth }) {
  return (
    <div className="flex items-center gap-1">
      <FixtureBar className="h-1.5 w-8 bg-stone-500/55" />
      {borderWidth === 2 ? <FixtureBar className="h-1 w-5 bg-stone-500/45" /> : null}
    </div>
  );
}

function CornerNotchFixtureSection({ testId, zoom }: { testId: string; zoom: FixtureZoom }) {
  return (
    <section data-testid={testId} className="grid gap-3 border border-stone-300 bg-stone-100 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        {FIXTURE_CONFIGS.map((config) => (
          <div
            key={`${config.type}-${config.borderWidth}-${zoom}`}
            className="grid gap-3 border border-stone-300 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <FixtureTypeMarkers type={config.type} />
              <FixtureBorderMarkers borderWidth={config.borderWidth} />
            </div>
            <div className="grid gap-2">
              <FixtureBar className="h-2 w-10 bg-stone-400/45" />
              <CornerNotchChip {...config} zoom={zoom} />
            </div>
            <div className="grid gap-2">
              <FixtureBar className="h-2 w-16 bg-stone-400/45" />
              <CornerNotchTouchingPair {...config} zoom={zoom} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CornerNotchDetailVisualFixture() {
  return (
    <div
      data-testid="corner-notch-detail-visual-fixture"
      className="min-h-screen bg-stone-200 p-6 text-stone-950"
    >
      <div className="mx-auto grid max-w-[1800px] gap-6">
        <CornerNotchFixtureSection testId="corner-notch-detail-raw" zoom={1} />

        <CornerNotchFixtureSection testId="corner-notch-detail-zoomed" zoom={12} />
      </div>
    </div>
  );
}
