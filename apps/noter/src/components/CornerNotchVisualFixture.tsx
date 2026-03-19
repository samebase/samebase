import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CORNER_NOTCH_CLASS, EMPHASIZED_BORDER_CLASS } from "@/lib/cornerNotch";

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
            Primary app chrome keeps its hard-square shape, but each corner now
            clips a single square pixel.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className={`${CORNER_NOTCH_CLASS} ${EMPHASIZED_BORDER_CLASS}`}>
            <CardHeader>
              <CardTitle>Auth Surface</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                className={`${CORNER_NOTCH_CLASS} ${EMPHASIZED_BORDER_CLASS}`}
                value="nicu@noter.md"
                readOnly
              />
              <Input
                className={`${CORNER_NOTCH_CLASS} ${EMPHASIZED_BORDER_CLASS}`}
                value="pass1234"
                readOnly
                type="password"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className={`${CORNER_NOTCH_CLASS} ${EMPHASIZED_BORDER_CLASS}`}
                >
                  Join waitlist
                </Button>
                <Button
                  className={`${CORNER_NOTCH_CLASS} border border-primary`}
                >
                  Sign in
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div
              className={`border border-stone-300 bg-white p-4 shadow-sm ${CORNER_NOTCH_CLASS}`}
            >
              <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                Surface
              </div>
              <div className="mt-2 text-sm text-stone-700">
                Border corners stay square to the eye, but the outer corner
                pixel is clipped off.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div
                className={`border border-stone-300 bg-stone-950 p-4 text-stone-50 ${CORNER_NOTCH_CLASS}`}
              >
                Dark panel
              </div>
              <div
                className={`border border-stone-300 bg-amber-100 p-4 ${CORNER_NOTCH_CLASS}`}
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
