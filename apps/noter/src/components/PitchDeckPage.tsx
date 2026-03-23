import { Deck, Heading, Slide, Text, defaultTheme } from "spectacle";

export type PitchDeckMode = "interactive" | "print";

export const PITCH_DECK_SURFACE_TEST_ID = "pitch-deck-surface";

const pitchDeckTheme = {
  ...defaultTheme,
  colors: {
    ...defaultTheme.colors,
    primary: "#f4efe6",
    secondary: "#14110f",
    tertiary: "#9a4f2d",
    quaternary: "#5b524a",
    quinary: "#d9c8b4",
  },
  fonts: {
    ...defaultTheme.fonts,
    header:
      '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    text: '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif',
    monospace: '"SF Mono", "Consolas", "Menlo", monospace',
  },
};

function FeatureCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-[#d9c8b4] bg-[#f8f4ee] p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-[#9a4f2d]">
        {eyebrow}
      </div>
      <div className="mt-3 text-lg font-medium tracking-[-0.02em] text-[#14110f]">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#5b524a]">{body}</p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#d9c8b4] bg-[#fcfaf6] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-[#7a6d62]">
        {label}
      </div>
      <div className="mt-2 text-[28px] leading-none tracking-[-0.04em] text-[#14110f]">
        {value}
      </div>
    </div>
  );
}

export function PitchDeckPage({ mode }: { mode: PitchDeckMode }) {
  const isPrintMode = mode === "print";

  return (
    <div className="min-h-screen bg-[#efe6d8] text-[#14110f]">
      <Deck
        theme={pitchDeckTheme}
        template={() => null}
        className="min-h-screen"
      >
        <Slide backgroundColor="#efe6d8" padding={0}>
          <div className="flex min-h-screen items-center justify-center px-4 py-4 sm:px-6 sm:py-6">
            <div
              data-testid={PITCH_DECK_SURFACE_TEST_ID}
              className="grid w-full max-w-[1280px] gap-6 border border-[#d9c8b4] bg-[#f7f2ea] p-6 shadow-[0_24px_80px_rgba(48,32,16,0.10)] lg:grid-cols-[1.3fr_0.9fr] lg:p-10"
            >
              <div className="flex flex-col justify-between gap-8">
                <div className="space-y-6">
                  <div className="text-[12px] uppercase tracking-[0.28em] text-[#9a4f2d]">
                    Pitch Deck Surface
                  </div>
                  <div className="space-y-4">
                    <Heading
                      color="#14110f"
                      fontSize={
                        isPrintMode ? "72px" : "clamp(3.2rem, 6vw, 4.8rem)"
                      }
                      lineHeight={0.92}
                      letterSpacing="-0.06em"
                      margin="0"
                    >
                      One route for story, print, and review.
                    </Heading>
                    <Text
                      color="#5b524a"
                      fontSize="22px"
                      lineHeight={1.45}
                      margin="0"
                    >
                      This first slide is only a proving ground. Spectacle owns
                      the presentation frame, while Noter owns routing, review,
                      and export.
                    </Text>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FeatureCard
                    eyebrow="Route"
                    title="Public by default"
                    body="The deck lives inside the existing frontend, loads without sign-in, and stays reviewable like normal product work."
                  />
                  <FeatureCard
                    eyebrow="Print"
                    title="PDF-ready surface"
                    body="A dedicated print route keeps export predictable instead of relying on ad hoc browser printing."
                  />
                  <FeatureCard
                    eyebrow="Design"
                    title="Polished without custom slide plumbing"
                    body="Spectacle gives us slide structure, theme control, and predictable layout while Tailwind handles small local adjustments."
                  />
                  <FeatureCard
                    eyebrow="Scope"
                    title="Content comes later"
                    body="The current goal is only to prove the route, theme, screenshot coverage, and export path with one strong-looking slide."
                  />
                </div>

                <div className="grid gap-3 border-t border-[#d9c8b4] pt-5 sm:grid-cols-3">
                  <MetricBlock label="Public Route" value="/pitch" />
                  <MetricBlock label="Print Route" value="/pitch/print" />
                  <MetricBlock label="Export" value="PDF" />
                </div>
              </div>

              <div className="grid gap-4">
                <div className="border border-[#d9c8b4] bg-[#fcfaf6] p-4">
                  <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[#7a6d62]">
                    Media Block
                  </div>
                  <img
                    alt="Noter visual surface"
                    className="block w-full border border-[#d9c8b4] object-cover"
                    src="/noter-social-card.png"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="border border-[#d9c8b4] bg-[#14110f] p-4 text-[#f7f2ea]">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#d9c8b4]">
                      Slide Stack
                    </div>
                    <div className="mt-3 text-2xl leading-tight tracking-[-0.04em]">
                      Spectacle on top of the existing React app
                    </div>
                  </div>
                  <div className="border border-[#d9c8b4] bg-[#f3ece2] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#7a6d62]">
                      Next Move
                    </div>
                    <div className="mt-3 text-2xl leading-tight tracking-[-0.04em] text-[#14110f]">
                      Replace the placeholder copy with the real pitch
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Slide>
      </Deck>
    </div>
  );
}
