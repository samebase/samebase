import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import { parseLandingSlogans } from "@/lib/landingSlogans";
import slogansRaw from "../../../../slogans.md?raw";

export type PrivateFileShareVisualMode =
  | "private-file-share-ssr"
  | "private-file-share-spa"
  | "private-file-share-progressive";

type ExperimentSpec = {
  title: string;
  deliveryLabel: string;
  summary: string;
  firstPaint: string;
  nextStep: string;
  whyItStaysReadable: readonly string[];
  featureNotes: readonly string[];
  deliverySteps: readonly string[];
};

type DetailRow = {
  label: string;
  value: string;
};

const SHAREABLE_FILE_PATH = "slogans.md";
const SHARE_RULES_MARKDOWN = `---
share:
  publicFiles:
    - slogans.md
---`;
const PRIVATE_REPOSITORY_PATHS = [
  "AGENTS.md",
  "apps/noter/src/bootstrap.ts",
  "apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx",
  "convex/schema.ts",
  ".env.local",
] as const;
const SHARED_SLOGANS = parseLandingSlogans(slogansRaw);

const EXPERIMENTS = {
  "private-file-share-ssr": {
    title: "SSR request renders one semantic page",
    deliveryLabel: "Edge request",
    summary:
      "Fetch one allowed blob, turn markdown into plain article HTML, and ship the page without any client renderer requirement.",
    firstPaint:
      "The first paint is already the accessible final document, so screen readers and low-power devices do not wait for hydration.",
    nextStep:
      "Add file metadata, canonical share URLs, and crawl-safe headers without changing the page model.",
    whyItStaysReadable: [
      "The code path is one request and one template, not a shell plus a second renderer.",
      "Semantic HTML keeps the public view understandable in source, assistive tech, and screenshots.",
      "We can reason about auth separately from presentation because the allowlist is explicit.",
    ],
    featureNotes: [
      "Best fit when the public page should feel instant on a cold open.",
      "Makes per-file caching and CDN revalidation straightforward.",
      "Keeps the public route independent from the private app bundle.",
    ],
    deliverySteps: [
      "Read allowlisted file path from repo config.",
      "Fetch one GitHub blob at request time.",
      "Render markdown into a small article template.",
      "Return HTML plus long-lived cache headers for unchanged blobs.",
    ],
  },
  "private-file-share-spa": {
    title: "SPA route boots with plain file payload",
    deliveryLabel: "Client route",
    summary:
      "Keep one route in the existing app, but load only the allowed file text and render it into the same semantic article shape before any richer UI wakes up.",
    firstPaint:
      "A lightweight route can still feel fast if the initial payload is just file text plus a tiny parser instead of a full markdown workbench.",
    nextStep:
      "Reuse the same payload shape inside a signed-in route so the public and private surfaces stay close.",
    whyItStaysReadable: [
      "The public view stays a normal article instead of a miniature editor.",
      "A tiny text-to-list parser is easier to audit than a renderer stack.",
      "We can move to SSR later because the output shape already matches the server case.",
    ],
    featureNotes: [
      "Best fit if we want to ship quickly inside today's app boundaries.",
      "Still lets us add signed-in affordances after boot without changing the public markup.",
      "Works well when public share traffic is modest and bundle size stays disciplined.",
    ],
    deliverySteps: [
      "Boot the route on the normal app shell.",
      "Fetch one public-file payload from an allowlisted endpoint.",
      "Render semantic HTML from the file text immediately.",
      "Hydrate optional controls only after the document is already readable.",
    ],
  },
  "private-file-share-progressive": {
    title: "Progressive enhancement adds a renderer only when needed",
    deliveryLabel: "HTML first",
    summary:
      "Start from the same semantic document as the other experiments, then attach a richer markdown renderer only for blocks that plain HTML stops handling well.",
    firstPaint:
      "The first paint is still the same article, so the enhancement never becomes a prerequisite for reading the shared file.",
    nextStep:
      "Gate richer rendering behind concrete needs like tables, callouts, or syntax-highlighted examples instead of adding it pre-emptively.",
    whyItStaysReadable: [
      "The baseline path remains easy to inspect because the renderer is optional, not foundational.",
      "Tailwind stays limited to layout and contrast instead of becoming the content model.",
      "Each new feature has to justify itself against a working accessible baseline.",
    ],
    featureNotes: [
      "Best fit if we expect markdown complexity to grow over time.",
      "Lets us keep shipping with plain HTML while testing whether richer blocks are worth their cost.",
      "Avoids locking the feature to one markdown renderer too early.",
    ],
    deliverySteps: [
      "Render the public page with semantic HTML first.",
      "Detect blocks that need richer treatment.",
      "Load renderer code only for those blocks.",
      "Keep the article readable even if enhancement fails.",
    ],
  },
} as const satisfies Record<PrivateFileShareVisualMode, ExperimentSpec>;

const SHARED_FILE_DETAILS = [
  {
    label: "Repository",
    value: "owner/noter-private",
  },
  {
    label: "Visible path",
    value: SHAREABLE_FILE_PATH,
  },
  {
    label: "Other repo files",
    value: "Stay private",
  },
] as const satisfies readonly DetailRow[];

/**
 * The experiment starts from the shared workspace-layout-v2 shell and a small
 * semantic document so we can compare delivery models before introducing a
 * markdown renderer or additional styling conventions.
 */
export function PrivateFileShareVisualFixture({
  mode,
}: {
  mode: PrivateFileShareVisualMode;
}) {
  const experiment = EXPERIMENTS[mode];

  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="private-file-share-visual-fixture"
      left={{
        header: <PaneHeader label="Visibility contract" />,
        headerTestId: "private-file-share-left-pane-header",
        content: <ShareContractPane />,
      }}
      main={{
        header: <PaneHeader label={experiment.deliveryLabel} />,
        headerTestId: "private-file-share-main-pane-header",
        content: <PublicSharePane experiment={experiment} />,
      }}
      right={{
        header: <PaneHeader label="Tradeoffs" />,
        headerTestId: "private-file-share-right-pane-header",
        content: <TradeoffPane experiment={experiment} />,
      }}
      panel={{
        header: <PaneHeader label="Why this line of research" />,
        headerTestId: "private-file-share-panel-pane-header",
        content: <ResearchPanel experiment={experiment} />,
      }}
    />
  );
}

function PaneHeader({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center border-b border-border px-3 text-xs font-medium text-muted-foreground">
      {label}
    </div>
  );
}

function ShareContractPane() {
  return (
    <div className="space-y-5 px-4 py-4 text-sm text-foreground">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Allowlist stays literal</h2>
        <p className="leading-6 text-muted-foreground">
          The easiest contract is "this repo exposes exactly one path." That
          keeps policy obvious for operators and easy to test.
        </p>
        <pre className="overflow-x-auto border border-border bg-muted/40 px-3 py-2 text-xs leading-6 text-foreground">
          <code>{SHARE_RULES_MARKDOWN}</code>
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Public details</h2>
        <dl className="space-y-2">
          {SHARED_FILE_DETAILS.map((detail) => (
            <div key={detail.label}>
              <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {detail.label}
              </dt>
              <dd className="font-mono text-xs text-foreground">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Still private</h2>
        <ul className="list-disc space-y-1 pl-5 font-mono text-xs text-muted-foreground">
          {PRIVATE_REPOSITORY_PATHS.map((filePath) => (
            <li key={filePath}>{filePath}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PublicSharePane({ experiment }: { experiment: ExperimentSpec }) {
  return (
    <article className="space-y-5 px-4 py-4 text-sm text-foreground">
      <header className="space-y-3 border-b border-border pb-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Public file share experiment
          </p>
          <h1 className="text-xl font-semibold leading-tight">
            {experiment.title}
          </h1>
        </div>
        <p className="max-w-3xl leading-6 text-muted-foreground">
          {experiment.summary}
        </p>
      </header>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">
            /share/owner/noter-private/slogans.md
          </p>
          <h2 className="text-lg font-medium">slogans.md</h2>
        </div>
        <p className="max-w-3xl leading-6 text-muted-foreground">
          {experiment.firstPaint}
        </p>
        <ol className="list-decimal space-y-2 pl-5 leading-6">
          {SHARED_SLOGANS.map((slogan) => (
            <li key={slogan}>{slogan}</li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function TradeoffPane({ experiment }: { experiment: ExperimentSpec }) {
  return (
    <div className="space-y-5 px-4 py-4 text-sm text-foreground">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Delivery path</h2>
        <ol className="list-decimal space-y-2 pl-5 leading-6 text-muted-foreground">
          {experiment.deliverySteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Readable by default</h2>
        <ul className="list-disc space-y-2 pl-5 leading-6 text-muted-foreground">
          {experiment.whyItStaysReadable.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">What this unlocks</h2>
        <ul className="list-disc space-y-2 pl-5 leading-6 text-muted-foreground">
          {experiment.featureNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ResearchPanel({ experiment }: { experiment: ExperimentSpec }) {
  return (
    <div className="space-y-3 px-4 py-4 text-sm text-foreground">
      <p className="max-w-5xl leading-6 text-muted-foreground">
        This direction treats public file sharing as an accessibility feature
        first: one allowed path, one readable page, one obvious upgrade path.
      </p>
      <p className="max-w-5xl leading-6 text-muted-foreground">
        {experiment.nextStep}
      </p>
    </div>
  );
}
