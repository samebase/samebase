import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { Input } from "@/components/input";
import { Button } from "@/components/button";
import {
  DEFAULT_CORNER_NOTCH_TYPE,
  CORNER_NOTCH_TYPES,
  EMPHASIZED_BORDER_CLASS,
  getCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";

const CORNER_NOTCH_LABELS: Record<CornerNotchType, string> = {
  0: "Type 0",
  1: "Type 1",
  2: "Type 2",
};

const CORNER_NOTCH_DESCRIPTIONS: Record<CornerNotchType, string> = {
  0: "Hard square corner.",
  1: "Square corner cutout sized to the border stroke.",
  2: "Two-step diagonal cut.",
};

export function CornerNotchVisualFixture() {
  return (
    <div
      data-testid="corner-notch-visual-fixture"
      className="min-h-screen bg-stone-100 p-10 text-stone-950"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Corner Notch Visual Fixture
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Primary app chrome keeps its hard-square shape while supporting
            multiple notch variants for the corner treatment.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card
            cornerNotch={DEFAULT_CORNER_NOTCH_TYPE}
            className={EMPHASIZED_BORDER_CLASS}
          >
            <CardHeader>
              <CardTitle>Auth Surface</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                cornerNotch={DEFAULT_CORNER_NOTCH_TYPE}
                className={EMPHASIZED_BORDER_CLASS}
                value="nicu@noter.md"
                readOnly
              />
              <Input
                cornerNotch={DEFAULT_CORNER_NOTCH_TYPE}
                className={EMPHASIZED_BORDER_CLASS}
                value="pass1234"
                readOnly
                type="password"
              />
              <div className="flex gap-3">
                <Button
                  cornerNotch={DEFAULT_CORNER_NOTCH_TYPE}
                  variant="outline"
                  className={EMPHASIZED_BORDER_CLASS}
                >
                  Join waitlist
                </Button>
                <Button
                  cornerNotch={DEFAULT_CORNER_NOTCH_TYPE}
                  className="border border-primary"
                >
                  Sign in
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="space-y-3">
              {CORNER_NOTCH_TYPES.map((type) => {
                const notchClass = getCornerNotchClass(type);

                return (
                  <Card
                    key={type}
                    cornerNotch={type}
                    className="border-stone-300 shadow-sm"
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                          {CORNER_NOTCH_LABELS[type]}
                        </div>
                        <div className="font-mono text-[11px] text-stone-400">
                          {notchClass}
                        </div>
                      </div>
                      <div className="text-sm text-stone-700">
                        {CORNER_NOTCH_DESCRIPTIONS[type]}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          cornerNotch={type}
                          className="border-stone-300"
                          readOnly
                          value={notchClass}
                        />
                        <Button
                          cornerNotch={type}
                          variant="outline"
                          className="border-stone-300"
                        >
                          Preview
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card
              cornerNotch={DEFAULT_CORNER_NOTCH_TYPE}
              className="border-stone-300 shadow-sm"
            >
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  Default
                </div>
                <div className="mt-2 text-sm text-stone-700">
                  The default app notch remains type 1 unless a component opts
                  into another notch shape.
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <div
                className={`border border-stone-300 bg-stone-950 p-4 text-stone-50 ${getCornerNotchClass(DEFAULT_CORNER_NOTCH_TYPE)}`}
              >
                Dark panel
              </div>
              <div
                className={`border border-stone-300 bg-amber-100 p-4 ${getCornerNotchClass(DEFAULT_CORNER_NOTCH_TYPE)}`}
              >
                Warm panel
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
