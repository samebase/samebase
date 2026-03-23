export type PitchDeckMode = "interactive" | "print" | "printMobile";

export const PITCH_DECK_SURFACE_TEST_ID = "pitch-deck-surface";

const featureCards = [
  {
    eyebrow: "Route",
    title: "Responsive by default",
    body: "The public deck route behaves like normal app UI instead of a fixed slide viewport, so it can adapt naturally across desktop and mobile screens.",
  },
  {
    eyebrow: "Print",
    title: "Deterministic export",
    body: "Dedicated print routes lock desktop and mobile dimensions so the PDF output stays stable and reviewable between builds.",
  },
  {
    eyebrow: "Stack",
    title: "App-owned surface",
    body: "The deck is plain React and Tailwind inside the existing frontend, which keeps styling, routing, and review workflows simple.",
  },
  {
    eyebrow: "Scope",
    title: "Story comes next",
    body: "This first pass only proves layout, theming, screenshot coverage, and export readiness with one intentionally polished placeholder slide.",
  },
] as const;

const metricBlocks = [
  {
    label: "Interactive",
    value: "/pitch",
  },
  {
    label: "Desktop PDF",
    value: "/pitch/print",
  },
  {
    label: "Mobile PDF",
    value: "/pitch/print/mobile",
  },
] as const;

const implementationNotes = [
  "One content source feeds interactive, desktop print, and mobile print modes.",
  "Tailwind owns layout and typography, with no slide-framework-specific viewport behavior.",
  "PDF export remains a separate command instead of slowing every normal app build.",
] as const;

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
    <div className="border border-[#d4c1aa] bg-[#faf5ed] p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-[#91512f]">
        {eyebrow}
      </div>
      <div className="mt-3 text-lg font-medium tracking-[-0.03em] text-[#17120e]">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#5d5246]">{body}</p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#d4c1aa] bg-[#fffaf3] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-[#7d7062]">
        {label}
      </div>
      <div className="mt-2 text-[24px] leading-none tracking-[-0.05em] text-[#17120e] sm:text-[28px]">
        {value}
      </div>
    </div>
  );
}

function resolveSurfaceClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "grid min-h-[720px] w-[1280px] gap-8 border border-[#d4c1aa] bg-[linear-gradient(180deg,#fbf7f0_0%,#f1e6d6_100%)] px-10 py-8 text-[#17120e] lg:grid-cols-[minmax(0,1.2fr)_minmax(23rem,0.85fr)]";
  }

  if (mode === "printMobile") {
    return "grid min-h-[1280px] w-[720px] gap-6 border border-[#d4c1aa] bg-[linear-gradient(180deg,#fbf7f0_0%,#f1e6d6_100%)] p-8 text-[#17120e]";
  }

  return "grid w-full max-w-[1360px] gap-6 border border-[#d4c1aa] bg-[linear-gradient(180deg,#fbf7f0_0%,#f1e6d6_100%)] p-5 text-[#17120e] sm:p-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.85fr)] xl:p-10";
}

function resolveHeaderClasses(mode: PitchDeckMode): {
  title: string;
  subtitle: string;
  cards: string;
  metrics: string;
  aside: string;
} {
  if (mode === "print") {
    return {
      title:
        "max-w-[11ch] font-serif text-[76px] leading-[0.9] tracking-[-0.07em]",
      subtitle: "max-w-[56ch] text-[22px] leading-[1.5] text-[#5d5246]",
      cards: "grid gap-4 md:grid-cols-2",
      metrics: "grid gap-3 sm:grid-cols-3",
      aside: "grid gap-4",
    };
  }

  if (mode === "printMobile") {
    return {
      title:
        "max-w-[10ch] font-serif text-[64px] leading-[0.92] tracking-[-0.07em]",
      subtitle: "max-w-[38ch] text-[22px] leading-[1.45] text-[#5d5246]",
      cards: "grid gap-4",
      metrics: "grid gap-3",
      aside: "grid gap-4",
    };
  }

  return {
    title:
      "max-w-[11ch] font-serif text-[clamp(3.3rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.07em]",
    subtitle:
      "max-w-[58ch] text-lg leading-[1.55] text-[#5d5246] sm:text-[21px]",
    cards: "grid gap-4 md:grid-cols-2",
    metrics: "grid gap-3 sm:grid-cols-3",
    aside: "grid gap-4",
  };
}

function PitchDeckSurface({ mode }: { mode: PitchDeckMode }) {
  const classes = resolveHeaderClasses(mode);

  return (
    <div
      data-testid={PITCH_DECK_SURFACE_TEST_ID}
      className={resolveSurfaceClasses(mode)}
    >
      <section className="flex flex-col justify-between gap-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-[#d4c1aa] pb-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#91512f]">
              Pitch Deck Surface
            </div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#7d7062]">
              React + Tailwind
            </div>
          </div>

          <div className="space-y-4">
            <h1 className={classes.title}>
              One route. Two print presets. Zero slide framework.
            </h1>
            <p className={classes.subtitle}>
              This placeholder slide proves the deck can live inside Noter as
              normal UI, stay responsive on <code>/pitch</code>, and export
              stable desktop and mobile PDFs from dedicated print routes.
            </p>
          </div>
        </div>

        <div className={classes.cards}>
          {featureCards.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>

        <div className={`border-t border-[#d4c1aa] pt-5 ${classes.metrics}`}>
          {metricBlocks.map((metric) => (
            <MetricBlock key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className={classes.aside}>
        <div className="border border-[#d4c1aa] bg-[#fffaf3] p-4">
          <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-[#7d7062]">
            <span>Visual Surface</span>
            <span>App-owned</span>
          </div>
          <img
            alt="Noter visual surface"
            className="block w-full border border-[#d4c1aa] object-cover"
            src="/noter-social-card.png"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-[#d4c1aa] bg-[#17120e] p-4 text-[#f8f3ea]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#d8c8b2]">
              Layout
            </div>
            <div className="mt-3 text-2xl leading-tight tracking-[-0.05em]">
              Normal React composition, not a deck-specific viewport.
            </div>
          </div>

          <div className="border border-[#d4c1aa] bg-[#f4eadb] p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#7d7062]">
              Next Move
            </div>
            <div className="mt-3 text-2xl leading-tight tracking-[-0.05em] text-[#17120e]">
              Replace the placeholder blocks with the real pitch story.
            </div>
          </div>
        </div>

        <div className="border border-[#d4c1aa] bg-[#fcf7ef] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[#91512f]">
            Implementation Notes
          </div>
          <ul className="mt-4 space-y-3 text-base leading-7 text-[#5d5246]">
            {implementationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function resolvePageFrameClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "min-h-screen overflow-auto bg-[#ede0cb] px-4 py-4 text-[#17120e]";
  }

  if (mode === "printMobile") {
    return "min-h-screen overflow-auto bg-[#ede0cb] px-4 py-4 text-[#17120e]";
  }

  return "min-h-screen bg-[#ede0cb] px-4 py-6 text-[#17120e] sm:px-6 sm:py-8";
}

/**
 * Keep one shared deck surface and vary only the outer layout preset per mode.
 * Interactive mode stays in normal document flow, while print modes lock a
 * deterministic page size for PDF export.
 */
export function PitchDeckPage({ mode }: { mode: PitchDeckMode }) {
  const centerClasses =
    mode === "interactive"
      ? "mx-auto flex w-full items-start justify-center"
      : "mx-auto flex w-full items-center justify-center";

  return (
    <div className={resolvePageFrameClasses(mode)}>
      <div className={centerClasses}>
        <PitchDeckSurface mode={mode} />
      </div>
    </div>
  );
}
