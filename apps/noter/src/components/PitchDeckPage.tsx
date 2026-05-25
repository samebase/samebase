import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    printBody: "The public deck behaves like normal app UI and adapts cleanly across screens.",
  },
  {
    eyebrow: "Print",
    title: "Deterministic export",
    body: "Dedicated print routes lock desktop and mobile dimensions so the PDF output stays stable and reviewable between builds.",
    printBody: "Dedicated print routes lock the page size so the PDF stays stable.",
  },
  {
    eyebrow: "Stack",
    title: "App-owned surface",
    body: "The deck is plain React and Tailwind inside the existing frontend, which keeps styling, routing, and review workflows simple.",
    printBody: "The deck stays inside the app with plain React and Tailwind.",
  },
  {
    eyebrow: "Scope",
    title: "Story comes next",
    body: "This first pass only proves layout, theming, screenshot coverage, and export readiness with one intentionally polished placeholder slide.",
    printBody: "This pass proves layout, theming, screenshots, and export readiness.",
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

const printImplementationNotes = [
  "One content source feeds every mode.",
  "Tailwind owns layout and typography.",
  "PDF export stays outside the normal build.",
] as const;

function FeatureCard({
  eyebrow,
  title,
  body,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "border border-border bg-background p-3"
          : "border border-border bg-background p-4"
      }
    >
      <div className="text-primary text-[11px] uppercase tracking-[0.24em]">{eyebrow}</div>
      <div
        className={
          compact
            ? "text-foreground mt-2 text-base font-medium tracking-[-0.03em]"
            : "text-foreground mt-3 text-lg font-medium tracking-[-0.03em]"
        }
      >
        {title}
      </div>
      <p
        className={
          compact
            ? "text-muted-foreground mt-1 text-xs leading-5"
            : "text-muted-foreground mt-2 text-sm leading-6"
        }
      >
        {body}
      </p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-secondary px-4 py-3 text-secondary-foreground">
      <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">{label}</div>
      <div className="mt-2 text-[24px] leading-none tracking-[-0.05em] sm:text-[28px]">{value}</div>
    </div>
  );
}

function PrintDesktopSurface() {
  return (
    <div
      data-testid={PITCH_DECK_SURFACE_TEST_ID}
      className="grid h-full w-full gap-6 overflow-hidden border border-border bg-background px-7 py-6 text-foreground"
      style={{ gridTemplateColumns: "minmax(0, 1.18fr) minmax(20rem, 0.82fr)" }}
    >
      <section className="flex min-h-0 flex-col gap-5">
        <div className="space-y-4">
          <div className="border-border flex items-center justify-between gap-4 border-b pb-3">
            <div className="text-primary text-[10px] uppercase tracking-[0.28em]">
              Pitch Deck Surface
            </div>
            <div className="text-muted-foreground text-[10px] uppercase tracking-[0.22em]">
              React + Tailwind
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="max-w-[11ch] font-sans text-[58px] font-medium leading-[0.88] tracking-[-0.07em]">
              One route. Two print presets. Zero slide framework.
            </h1>
            <p className="text-muted-foreground max-w-[42ch] text-[18px] leading-[1.45]">
              The pitch deck renders as normal app UI, then exports from fixed desktop and mobile
              print surfaces into direct PDF files.
            </p>
          </div>
        </div>

        <div className="grid flex-1 gap-3 md:grid-cols-2">
          {featureCards.map((feature) => (
            <FeatureCard
              key={feature.title}
              body={feature.printBody}
              compact
              eyebrow={feature.eyebrow}
              title={feature.title}
            />
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {metricBlocks.map((metric) => (
            <MetricBlock key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="grid min-h-0 gap-3">
        <div className="border border-border bg-secondary p-3 text-secondary-foreground">
          <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.22em] opacity-70">
            <span>Visual Surface</span>
            <span>App-owned</span>
          </div>
          <img
            alt="Noter visual surface"
            className="border-border block h-[220px] w-full border object-cover"
            src="/noter-social-card.png"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-border bg-primary p-3 text-primary-foreground">
            <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">Layout</div>
            <div className="mt-2 text-[18px] leading-tight tracking-[-0.04em]">
              Fixed-size HTML matches the exported PDF page exactly.
            </div>
          </div>

          <div className="border border-border bg-secondary p-3 text-secondary-foreground">
            <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">Next Move</div>
            <div className="mt-2 text-[18px] leading-tight tracking-[-0.04em]">
              Replace the placeholder content with the real pitch story.
            </div>
          </div>
        </div>

        <div className="border border-border bg-background p-4">
          <div className="text-primary text-[10px] uppercase tracking-[0.24em]">
            Implementation Notes
          </div>
          <ul className="text-muted-foreground mt-3 space-y-2 text-sm leading-5">
            {printImplementationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function PrintMobileSurface() {
  return (
    <div
      data-testid={PITCH_DECK_SURFACE_TEST_ID}
      className="grid h-full w-full gap-4 overflow-hidden border border-border bg-background p-5 text-foreground"
    >
      <section className="space-y-4">
        <div className="border-border flex items-center justify-between gap-3 border-b pb-3">
          <div className="text-primary text-[10px] uppercase tracking-[0.26em]">
            Pitch Deck Surface
          </div>
          <div className="text-muted-foreground text-[10px] uppercase tracking-[0.22em]">
            React + Tailwind
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="max-w-[9ch] font-sans text-[46px] font-medium leading-[0.9] tracking-[-0.07em]">
            One route. Two print presets. Zero slide framework.
          </h1>
          <p className="text-muted-foreground max-w-[34ch] text-[16px] leading-[1.45]">
            The deck lives inside Noter as normal UI and exports direct desktop and mobile PDFs from
            fixed print surfaces.
          </p>
        </div>
      </section>

      <div className="border border-border bg-secondary p-3 text-secondary-foreground">
        <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.22em] opacity-70">
          <span>Visual Surface</span>
          <span>App-owned</span>
        </div>
        <img
          alt="Noter visual surface"
          className="border-border block h-[210px] w-full border object-cover"
          src="/noter-social-card.png"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {featureCards.map((feature) => (
          <FeatureCard
            key={feature.title}
            body={feature.printBody}
            compact
            eyebrow={feature.eyebrow}
            title={feature.title}
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-border bg-primary p-3 text-primary-foreground">
          <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">Layout</div>
          <div className="mt-2 text-[18px] leading-tight tracking-[-0.04em]">
            Fixed-size HTML matches the exported mobile PDF page.
          </div>
        </div>

        <div className="border border-border bg-secondary p-3 text-secondary-foreground">
          <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">Next Move</div>
          <div className="mt-2 text-[18px] leading-tight tracking-[-0.04em]">
            Replace the placeholder content with the real pitch story.
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {metricBlocks.map((metric) => (
          <MetricBlock key={metric.label} {...metric} />
        ))}
      </div>

      <div className="border border-border bg-background p-4">
        <div className="text-primary text-[10px] uppercase tracking-[0.24em]">
          Implementation Notes
        </div>
        <ul className="text-muted-foreground mt-3 space-y-2 text-sm leading-5">
          {printImplementationNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
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
      title: "max-w-[11ch] font-sans text-[76px] font-medium leading-[0.9] tracking-[-0.07em]",
      subtitle: "text-muted-foreground max-w-[56ch] text-[22px] leading-[1.5]",
      cards: "grid gap-4 md:grid-cols-2",
      metrics: "grid gap-3 sm:grid-cols-3",
      aside: "grid gap-4",
    };
  }

  if (mode === "printMobile") {
    return {
      title: "max-w-[10ch] font-sans text-[64px] font-medium leading-[0.92] tracking-[-0.07em]",
      subtitle: "text-muted-foreground max-w-[38ch] text-[22px] leading-[1.45]",
      cards: "grid gap-4",
      metrics: "grid gap-3",
      aside: "grid gap-4",
    };
  }

  return {
    title:
      "max-w-[11ch] font-sans text-[clamp(3.3rem,7vw,5.5rem)] font-medium leading-[0.92] tracking-[-0.07em]",
    subtitle: "text-muted-foreground max-w-[58ch] text-lg leading-[1.55] sm:text-[21px]",
    cards: "grid gap-4 md:grid-cols-2",
    metrics: "grid gap-3 sm:grid-cols-3",
    aside: "grid gap-4",
  };
}

function PitchDeckSurface({ mode }: { mode: PitchDeckMode }) {
  const classes = resolveHeaderClasses(mode);
  const showPdfDownloads = mode === "interactive";

  return (
    <div data-testid={PITCH_DECK_SURFACE_TEST_ID} className={resolveSurfaceClasses(mode)}>
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
            <h1 className={classes.title}>One route. Two print presets. Zero slide framework.</h1>
            <p className={classes.subtitle}>
              This placeholder slide proves the deck can live inside Noter as normal UI, stay
              responsive on <code>/pitch</code>, and expose direct desktop and mobile PDF downloads
              generated from the export pipeline.
            </p>
          </div>

          {showPdfDownloads ? (
            <div className="flex flex-wrap gap-3">
              {pdfDownloads.map((pdfDownload) => (
                <a
                  key={pdfDownload.href}
                  className={cn(buttonVariants(), "min-w-[11rem]")}
                  download={pdfDownload.download}
                  href={pdfDownload.href}
                >
                  Download {pdfDownload.label}
                </a>
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
            <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">Layout</div>
            <div className="mt-3 text-2xl leading-tight tracking-[-0.05em]">
              Normal React composition, not a deck-specific viewport.
            </div>
          </div>

          <div className="border border-border bg-secondary p-4 text-secondary-foreground">
            <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">Next Move</div>
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
    return "h-[720px] w-[1280px] overflow-hidden bg-background text-foreground";
  }

  if (mode === "printMobile") {
    return "h-[1280px] w-[720px] overflow-hidden bg-background text-foreground";
  }

  return "bg-background text-foreground min-h-screen px-4 py-6 sm:px-6 sm:py-8";
}

/**
 * Keep one shared deck surface and vary only the outer layout preset per mode.
 * Interactive mode stays in normal document flow, while print modes lock a
 * deterministic page size for PDF export.
 */
export function PitchDeckPage({ mode }: { mode: PitchDeckMode }) {
  if (mode === "print") {
    return (
      <div className={resolvePageFrameClasses(mode)}>
        <PrintDesktopSurface />
      </div>
    );
  }

  if (mode === "printMobile") {
    return (
      <div className={resolvePageFrameClasses(mode)}>
        <PrintMobileSurface />
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
