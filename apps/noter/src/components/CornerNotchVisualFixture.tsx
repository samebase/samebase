import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#src/components/card.tsx";
import { Input } from "#src/components/input.tsx";
import { Button } from "#src/components/ui/button.tsx";
import {
  DEFAULT_CORNER_NOTCH_TYPE,
  CORNER_NOTCH_TYPES,
  EMPHASIZED_BORDER_CLASS,
  getCornerNotchClass,
  type CornerNotchType,
} from "#src/lib/cornerNotch.ts";
import { cn } from "#src/lib/utils.ts";

function FixtureBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-none bg-current/50", className)}
    />
  );
}

function FixtureButtonLabel({ className }: { className?: string }) {
  return <FixtureBar className={cn("h-2.5", className)} />;
}

function FixtureTypeMarkers({ type }: { type: CornerNotchType }) {
  return (
    <div className="flex items-center gap-1.5">
      {CORNER_NOTCH_TYPES.map((markerType) => (
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

function FixtureEmptyInput({ className }: { className?: string }) {
  return (
    <div className="relative">
      <Input
        className={cn("border-stone-300 text-transparent", className)}
        readOnly
        value=""
      />
      <FixtureBar className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-24 -translate-y-1/2 bg-stone-400/55" />
    </div>
  );
}

export function CornerNotchVisualFixture() {
  return (
    <div
      data-testid="corner-notch-visual-fixture"
      className="min-h-screen bg-stone-100 p-10 text-stone-950"
    >
      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className={EMPHASIZED_BORDER_CLASS}>
          <CardHeader>
            <CardTitle>
              <FixtureBar className="h-3 w-28 bg-foreground/65" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FixtureEmptyInput className={EMPHASIZED_BORDER_CLASS} />
            <FixtureEmptyInput className={EMPHASIZED_BORDER_CLASS} />
            <div className="flex gap-3">
              <Button variant="outline" className={EMPHASIZED_BORDER_CLASS}>
                <FixtureButtonLabel className="w-20" />
              </Button>
              <Button className="border border-primary">
                <FixtureButtonLabel className="w-12 bg-current/65" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="space-y-3">
            {CORNER_NOTCH_TYPES.map((type) => {
              const notchClass = getCornerNotchClass(type);

              return (
                <Card key={type} className="border-stone-300 shadow-sm">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <FixtureTypeMarkers type={type} />
                      <FixtureBar className="h-2.5 w-24 bg-stone-400/55" />
                    </div>
                    <div className="grid gap-2">
                      <FixtureBar className="h-2.5 w-32 bg-stone-500/45" />
                      <FixtureBar className="h-2.5 w-44 bg-stone-400/45" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <FixtureEmptyInput />
                      <Button variant="outline" className="border-stone-300">
                        <FixtureButtonLabel className="w-12" />
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "h-7 border border-stone-300 bg-stone-50",
                        notchClass,
                      )}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-stone-300 shadow-sm">
            <CardContent className="space-y-2 p-4">
              <FixtureBar className="h-2.5 w-16 bg-stone-500/45" />
              <FixtureBar className="h-2.5 w-48 bg-stone-400/45" />
              <FixtureBar className="h-2.5 w-36 bg-stone-400/35" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <div
              className={cn(
                "border border-stone-300 bg-stone-950 p-4 text-stone-50",
                getCornerNotchClass(DEFAULT_CORNER_NOTCH_TYPE),
              )}
            >
              <FixtureBar className="h-3 w-16 bg-current/75" />
            </div>
            <div
              className={cn(
                "border border-stone-300 bg-amber-100 p-4 text-stone-900",
                getCornerNotchClass(DEFAULT_CORNER_NOTCH_TYPE),
              )}
            >
              <FixtureBar className="h-3 w-16 bg-current/55" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
