import { type ReactNode } from "react";
import {
  ArrowRight,
  ExternalLink,
  LoaderCircle,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/button";

function FixtureSection({
  children,
  description,
  testId,
  title,
}: {
  children: ReactNode;
  description: string;
  testId: string;
  title: string;
}) {
  return (
    <section
      data-testid={testId}
      className="grid gap-4 border border-stone-300 bg-white p-5"
    >
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        <p className="text-xs text-stone-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ButtonRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid items-center gap-3 border border-stone-200 bg-stone-50 p-3 md:grid-cols-[11rem_1fr]">
      <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function ButtonVisualFixture() {
  return (
    <div
      data-testid="button-visual-fixture"
      className="min-h-screen bg-stone-100 p-8 text-stone-950"
    >
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="grid gap-2 border border-stone-300 bg-white p-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Button Visual Fixture
          </h1>
          <p className="max-w-3xl text-sm text-stone-600">
            Shared button coverage for the concrete variant, size, state, and
            override combinations currently used across the app. These snapshots
            use zero tolerance so small silhouette changes fail immediately.
          </p>
        </header>

        <FixtureSection
          testId="button-visual-variants"
          title="Variants"
          description="Default-size shared variants used in product surfaces."
        >
          <ButtonRow label="default">
            <Button>Launch workspace</Button>
            <Button>
              <Plus />
              New vault
            </Button>
          </ButtonRow>
          <ButtonRow label="outline">
            <Button variant="outline">Open preview</Button>
            <Button variant="outline">
              <ExternalLink />
              Open in browser
            </Button>
          </ButtonRow>
          <ButtonRow label="secondary">
            <Button variant="secondary">Got it</Button>
          </ButtonRow>
          <ButtonRow label="ghost">
            <Button variant="ghost">Cancel</Button>
            <Button variant="ghost">
              <PanelLeft />
              Toggle sidebar
            </Button>
          </ButtonRow>
          <ButtonRow label="destructive">
            <Button variant="destructive">
              <Trash2 />
              Delete vault
            </Button>
          </ButtonRow>
          <ButtonRow label="link">
            <Button variant="link">Reconnect</Button>
            <Button variant="link">
              View logs
              <ArrowRight />
            </Button>
          </ButtonRow>
        </FixtureSection>

        <FixtureSection
          testId="button-visual-sizes"
          title="Sizes"
          description="Sizes and icon composition currently used by shared app buttons."
        >
          <ButtonRow label="default">
            <Button>Primary action</Button>
            <Button variant="outline">Secondary action</Button>
          </ButtonRow>
          <ButtonRow label="sm">
            <Button size="sm">Compact action</Button>
            <Button size="sm" variant="outline">
              Review diff
            </Button>
            <Button size="sm" variant="ghost">
              Dismiss
            </Button>
          </ButtonRow>
          <ButtonRow label="icon">
            <Button size="icon" variant="secondary" aria-label="Open user menu">
              <MoreHorizontal />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Collapse panel">
              <PanelLeft />
            </Button>
          </ButtonRow>
        </FixtureSection>

        <FixtureSection
          testId="button-visual-states"
          title="States"
          description="Disabled and pending-looking states used in async product flows."
        >
          <ButtonRow label="disabled">
            <Button disabled>Launch workspace</Button>
            <Button variant="outline" disabled>
              Open preview
            </Button>
            <Button variant="ghost" size="sm" disabled>
              Cancel
            </Button>
            <Button variant="destructive" disabled>
              Delete vault
            </Button>
          </ButtonRow>
          <ButtonRow label="busy label">
            <Button disabled>
              <LoaderCircle className="animate-spin" />
              Removing...
            </Button>
            <Button variant="outline" disabled>
              <LoaderCircle className="animate-spin" />
              Fetching logs...
            </Button>
          </ButtonRow>
        </FixtureSection>

        <FixtureSection
          testId="button-visual-overrides"
          title="App Overrides"
          description="Known button overrides used in the app on top of shared button styling."
        >
          <ButtonRow label="asChild">
            <Button asChild variant="outline">
              <a href="#open-preview">Open preview</a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="#view-details">View details</a>
            </Button>
            <Button asChild variant="link" size="sm">
              <a href="#retry-provider">Retry provider</a>
            </Button>
          </ButtonRow>
          <ButtonRow label="shape overrides">
            <Button size="sm" variant="outline" className="rounded-none">
              Static SVG
            </Button>
            <Button size="icon" variant="secondary" className="rounded-ui">
              <MoreHorizontal />
            </Button>
          </ButtonRow>
          <ButtonRow label="layout overrides">
            <Button size="sm" className="h-7 px-2 text-xs">
              Rebase onto latest GitHub
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
              Copy conflict bundle
            </Button>
            <Button variant="outline" className="w-full md:w-56">
              Full width CTA
            </Button>
          </ButtonRow>
        </FixtureSection>
      </div>
    </div>
  );
}
