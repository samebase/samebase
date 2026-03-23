import type { CSSProperties } from "react";

export type PitchDeckMode = "interactive" | "print" | "printMobile";

export const PITCH_DECK_SURFACE_TEST_ID = "pitch-deck-surface";

const printLinks = [
  {
    label: "Desktop print",
    href: "/pitch/print",
  },
  {
    label: "Mobile print",
    href: "/pitch/print/mobile",
  },
] as const;

type DeckSlide = {
  id: string;
  title: string;
  support?: string;
};

const deckSlides: readonly DeckSlide[] = [
  {
    id: "opening",
    title: "Use Codex or Claude.\nNoter handles the stack.",
    support: "GitHub, Cloudflare, and Convex, already set up.",
  },
  {
    id: "ai-tax",
    title: "App builders\ncharge twice for AI.",
    support:
      "You already pay for Codex or Claude. Then they meter tokens again.",
  },
  {
    id: "config",
    title: "No-code splits\nconfig from code.",
    support: "One group edits JSON. Another group writes the real components.",
  },
  {
    id: "product",
    title: "In Noter,\nboth paths are just code.",
    support: "Open a GitHub repo. Change files from the web or over MCP.",
  },
  {
    id: "speed",
    title: "Ideas should start\nin seconds, not minutes.",
    support: "Open it from the web, even on mobile, before the idea fades.",
  },
  {
    id: "portability",
    title: "Your stack\nstays yours.",
    support: "GitHub, Cloudflare, and Convex still belong to you.",
  },
  {
    id: "proof",
    title: "We build Noter\nwith Noter.",
    support: "Same workflow. Same stack. Daily pressure.",
  },
] as const;

function resolvePageFrameClasses(mode: PitchDeckMode): string {
  if (mode === "interactive") {
    return "min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-6";
  }

  return "bg-background text-foreground";
}

function resolveDeckContainerClasses(mode: PitchDeckMode): string {
  if (mode === "interactive") {
    return "mx-auto flex w-full max-w-[1380px] flex-col";
  }

  return "flex flex-col";
}

function resolveSlidePageClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "relative flex h-[7.5in] w-[13.333in] items-center bg-background px-12 py-10";
  }

  if (mode === "printMobile") {
    return "relative flex h-[13.333in] w-[7.5in] items-start bg-background px-8 py-10";
  }

  return "relative flex min-h-[88svh] items-center";
}

function resolveSlideInnerClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "flex w-full max-w-[62rem] flex-col gap-6";
  }

  if (mode === "printMobile") {
    return "flex w-full max-w-[26rem] flex-col gap-5";
  }

  return "flex w-full max-w-[70rem] flex-col gap-5";
}

function resolveTitleClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "max-w-[11ch] whitespace-pre-line text-[74px] font-medium leading-[0.9] tracking-[-0.045em]";
  }

  if (mode === "printMobile") {
    return "max-w-[10ch] whitespace-pre-line text-[56px] font-medium leading-[0.92] tracking-[-0.045em]";
  }

  return "max-w-[11ch] whitespace-pre-line text-[clamp(3.3rem,8vw,6.2rem)] font-medium leading-[0.92] tracking-[-0.045em]";
}

function resolveSupportClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "max-w-[34ch] text-[24px] leading-[1.42] text-foreground/70";
  }

  if (mode === "printMobile") {
    return "max-w-[23ch] text-[20px] leading-[1.45] text-foreground/70";
  }

  return "max-w-[33ch] text-[clamp(1.2rem,2.1vw,1.55rem)] leading-[1.42] text-foreground/70";
}

function resolveBrandClasses(mode: PitchDeckMode): string {
  if (mode === "print") {
    return "absolute left-12 top-10 text-[15px] font-medium tracking-[-0.02em] text-foreground/45";
  }

  if (mode === "printMobile") {
    return "absolute left-8 top-10 text-[15px] font-medium tracking-[-0.02em] text-foreground/45";
  }

  return "";
}

function DeckSlidePage({
  index,
  mode,
  slide,
  totalSlides,
}: {
  index: number;
  mode: PitchDeckMode;
  slide: DeckSlide;
  totalSlides: number;
}) {
  const TitleTag = index === 0 ? "h1" : "h2";
  const pageBreakStyle: CSSProperties | undefined =
    mode === "interactive"
      ? undefined
      : {
          pageBreakAfter: index === totalSlides - 1 ? "auto" : "always",
        };

  return (
    <section className={resolveSlidePageClasses(mode)} style={pageBreakStyle}>
      {mode === "interactive" ? null : (
        <div aria-hidden="true" className={resolveBrandClasses(mode)}>
          noter
        </div>
      )}
      <div className={resolveSlideInnerClasses(mode)}>
        <TitleTag className={resolveTitleClasses(mode)}>{slide.title}</TitleTag>
        {slide.support ? (
          <p className={resolveSupportClasses(mode)}>{slide.support}</p>
        ) : null}
      </div>
    </section>
  );
}

function InteractiveDeckToolbar() {
  return (
    <div className="flex items-start justify-between gap-6 text-sm text-muted-foreground">
      <div
        aria-hidden="true"
        className="text-[15px] font-medium tracking-[-0.02em] text-foreground/45"
      >
        noter
      </div>
      <div className="flex gap-6">
        {printLinks.map((link) => (
          <a
            key={link.href}
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
            href={link.href}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function PitchDeckSurface({ mode }: { mode: PitchDeckMode }) {
  return (
    <div
      className={resolveDeckContainerClasses(mode)}
      data-testid={PITCH_DECK_SURFACE_TEST_ID}
    >
      {mode === "interactive" ? <InteractiveDeckToolbar /> : null}

      {deckSlides.map((slide, index) => (
        <DeckSlidePage
          key={slide.id}
          index={index}
          mode={mode}
          slide={slide}
          totalSlides={deckSlides.length}
        />
      ))}
    </div>
  );
}

export function PitchDeckPage({ mode }: { mode: PitchDeckMode }) {
  const centerClasses =
    mode === "interactive"
      ? "mx-auto flex w-full items-start justify-center"
      : "flex w-full items-start justify-center";

  return (
    <div className={resolvePageFrameClasses(mode)}>
      <div className={centerClasses}>
        <PitchDeckSurface mode={mode} />
      </div>
    </div>
  );
}
