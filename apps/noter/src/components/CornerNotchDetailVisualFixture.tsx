import { cn } from "@/lib/utils";

type FixtureBorderWidth = 1 | 2;
type FixtureBoxSize = 16 | 32;
type FixtureZoom = 1 | 12;
type FixtureConfig = {
  borderWidth: FixtureBorderWidth;
  size: FixtureBoxSize;
  type: 0 | 1 | 2;
};

const FIXTURE_CONFIGS: FixtureConfig[] = [
  { borderWidth: 1, size: 16, type: 0 },
  { borderWidth: 1, size: 16, type: 1 },
  { borderWidth: 1, size: 16, type: 2 },
  { borderWidth: 2, size: 16, type: 0 },
  { borderWidth: 2, size: 16, type: 1 },
  { borderWidth: 2, size: 16, type: 2 },
  { borderWidth: 1, size: 32, type: 0 },
  { borderWidth: 1, size: 32, type: 1 },
  { borderWidth: 1, size: 32, type: 2 },
  { borderWidth: 2, size: 32, type: 0 },
  { borderWidth: 2, size: 32, type: 1 },
  { borderWidth: 2, size: 32, type: 2 },
];

function CornerNotchChip({
  borderWidth,
  size,
  type,
  zoom,
}: FixtureConfig & {
  zoom: FixtureZoom;
}) {
  const chip = (
    <div
      className={cn(
        "bg-white border-stone-500",
        borderWidth === 1 ? "border" : "border-2",
        `corner-notch-${type}`,
      )}
      style={{
        height: size,
        transform: zoom === 1 ? undefined : `scale(${zoom})`,
        transformOrigin: zoom === 1 ? undefined : "top left",
        width: size,
      }}
    />
  );

  if (zoom === 1) {
    return (
      <div className="w-fit border border-stone-400 bg-stone-300 p-2">
        {chip}
      </div>
    );
  }

  return (
    <div className="w-fit border border-stone-400 bg-stone-300 p-3">
      <div
        className="relative overflow-visible"
        style={{ height: size * zoom, width: size * zoom }}
      >
        {chip}
      </div>
    </div>
  );
}

function CornerNotchFixtureSection({
  description,
  testId,
  title,
  zoom,
}: {
  description: string;
  testId: string;
  title: string;
  zoom: FixtureZoom;
}) {
  return (
    <section
      data-testid={testId}
      className="grid gap-3 border border-stone-300 bg-stone-100 p-4"
    >
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        <p className="text-xs text-stone-600">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {FIXTURE_CONFIGS.map((config) => (
          <div
            key={`${config.type}-${config.size}-${config.borderWidth}-${zoom}`}
            className="grid gap-3 border border-stone-300 bg-white p-3"
          >
            <div className="font-mono text-[11px] text-stone-700">
              {`type ${config.type} • ${config.size}x${config.size} • border ${config.borderWidth}px`}
            </div>
            <CornerNotchChip {...config} zoom={zoom} />
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
        <CornerNotchFixtureSection
          testId="corner-notch-detail-raw"
          title="Raw tiny captures"
          description="Actual rendered box sizes on gray background."
          zoom={1}
        />

        <CornerNotchFixtureSection
          testId="corner-notch-detail-zoomed"
          title="Zoomed inspection views"
          description="Same boxes scaled up 12x for corner inspection."
          zoom={12}
        />
      </div>
    </div>
  );
}
