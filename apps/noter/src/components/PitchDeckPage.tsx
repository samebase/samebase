import { Button } from "@/components/button";

export type PitchDeckMode = "interactive" | "print" | "printMobile";

export const PITCH_DECK_SURFACE_TEST_ID = "pitch-deck-surface";

const pdfDownloads = [
  {
    label: "Desktop PDF",
    href: "/pitch-deck.pdf",
    download: "noter-pitch-deck.pdf",
  },
  {
    label: "Mobile PDF",
    href: "/pitch-deck-mobile.pdf",
    download: "noter-pitch-deck-mobile.pdf",
  },
] as const;

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
    value: "pitch-deck.pdf",
  },
  {
    label: "Mobile PDF",
    value: "pitch-deck-mobile.pdf",
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
    <div className="border border-border bg-background p-4">
      <div className="text-primary text-[11px] uppercase tracking-[0.24em]">
        {eyebrow}
      </div>
      <div className="text-foreground mt-3 text-lg font-medium tracking-[-0.03em]">
        {title}
      </div>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{body}</p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-secondary px-4 py-3 text-secondary-foreground">
      <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
        {label}
      </div>
      <div className="mt-2 text-[24px] leading-none tracking-[-0.05em] sm:text-[28px]">
        {value}
      </div>
    </div>
  );
}

function resolveSurfaceClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "grid h-full w-full overflow-hidden border border-border bg-background px-10 py-8 text-foreground lg:grid-cols-[minmax(0,1.2fr)_minmax(23rem,0.85fr)]";
  }

  if (mode === "printMobile") {
    return "grid h-full w-full overflow-hidden border border-border bg-background p-8 text-foreground";
  }

  return "grid w-full max-w-[1360px] gap-6 border border-border bg-background p-5 text-foreground sm:p-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.85fr)] xl:p-10";
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
        "max-w-[11ch] font-sans text-[76px] font-medium leading-[0.9] tracking-[-0.07em]",
      subtitle: "text-muted-foreground max-w-[56ch] text-[22px] leading-[1.5]",
      cards: "grid gap-4 md:grid-cols-2",
      metrics: "grid gap-3 sm:grid-cols-3",
      aside: "grid gap-4",
    };
  }

  if (mode === "printMobile") {
    return {
      title:
        "max-w-[10ch] font-sans text-[64px] font-medium leading-[0.92] tracking-[-0.07em]",
      subtitle: "text-muted-foreground max-w-[38ch] text-[22px] leading-[1.45]",
      cards: "grid gap-4",
      metrics: "grid gap-3",
      aside: "grid gap-4",
    };
  }

  return {
    title:
      "max-w-[11ch] font-sans text-[clamp(3.3rem,7vw,5.5rem)] font-medium leading-[0.92] tracking-[-0.07em]",
    subtitle:
      "text-muted-foreground max-w-[58ch] text-lg leading-[1.55] sm:text-[21px]",
    cards: "grid gap-4 md:grid-cols-2",
    metrics: "grid gap-3 sm:grid-cols-3",
    aside: "grid gap-4",
  };
}

function PitchDeckSurface({ mode }: { mode: PitchDeckMode }) {
  const classes = resolveHeaderClasses(mode);
  const showPdfDownloads = mode === "interactive";

  return (
    <div
      data-testid={PITCH_DECK_SURFACE_TEST_ID}
      className={resolveSurfaceClasses(mode)}
    >
      <section className="flex flex-col justify-between gap-8">
        <div className="space-y-6">
          <div className="border-border flex items-center justify-between gap-4 border-b pb-4">
            <div className="text-primary text-[11px] uppercase tracking-[0.28em]">
              Pitch Deck Surface
            </div>
            <div className="text-muted-foreground text-[11px] uppercase tracking-[0.22em]">
              React + Tailwind
            </div>
          </div>

          <div className="space-y-4">
            <h1 className={classes.title}>
              One route. Two print presets. Zero slide framework.
            </h1>
            <p className={classes.subtitle}>
              This placeholder slide proves the deck can live inside Noter as
              normal UI, stay responsive on <code>/pitch</code>, and expose
              direct desktop and mobile PDF downloads generated from the export
              pipeline.
            </p>
          </div>

          {showPdfDownloads ? (
            <div className="flex flex-wrap gap-3">
              {pdfDownloads.map((pdfDownload) => (
                <Button
                  key={pdfDownload.href}
                  asChild
                  className="min-w-[11rem]"
                  cornerNotch={1}
                >
                  <a download={pdfDownload.download} href={pdfDownload.href}>
                    Download {pdfDownload.label}
                  </a>
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={classes.cards}>
          {featureCards.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>

        <div className={`border-border border-t pt-5 ${classes.metrics}`}>
          {metricBlocks.map((metric) => (
            <MetricBlock key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className={classes.aside}>
        <div className="border border-border bg-secondary p-4 text-secondary-foreground">
          <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] opacity-70">
            <span>Visual Surface</span>
            <span>App-owned</span>
          </div>
          <img
            alt="Noter visual surface"
            className="border-border block w-full border object-cover"
            src="/noter-social-card.png"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-border bg-primary p-4 text-primary-foreground">
            <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
              Layout
            </div>
            <div className="mt-3 text-2xl leading-tight tracking-[-0.05em]">
              Normal React composition, not a deck-specific viewport.
            </div>
          </div>

          <div className="border border-border bg-secondary p-4 text-secondary-foreground">
            <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
              Next Move
            </div>
            <div className="mt-3 text-2xl leading-tight tracking-[-0.05em]">
              Replace the placeholder blocks with the real pitch story.
            </div>
          </div>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="text-primary text-[11px] uppercase tracking-[0.24em]">
            Implementation Notes
          </div>
          <ul className="text-muted-foreground mt-4 space-y-3 text-base leading-7">
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
    return "bg-background text-foreground h-[7.5in] w-[13.333in] overflow-hidden";
  }

  if (mode === "printMobile") {
    return "bg-background text-foreground h-[13.333in] w-[7.5in] overflow-hidden";
  }

  return "bg-background text-foreground min-h-screen px-4 py-6 sm:px-6 sm:py-8";
}

/**
 * Keep one shared deck surface and vary only the outer layout preset per mode.
 * Interactive mode stays in normal document flow, while print modes lock a
 * deterministic page size for PDF export.
 */
export function PitchDeckPage({ mode }: { mode: PitchDeckMode }) {
  if (mode === "print" || mode === "printMobile") {
    return (
      <div className={resolvePageFrameClasses(mode)}>
        <PitchDeckSurface mode={mode} />
      </div>
    );
  }

  const centerClasses = "mx-auto flex w-full items-start justify-center";

  return (
    <div className={resolvePageFrameClasses(mode)}>
      <div className={centerClasses}>
        <PitchDeckSurface mode={mode} />
      </div>
    </div>
  );
}
