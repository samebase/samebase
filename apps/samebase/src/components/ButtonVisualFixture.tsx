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
import { Button } from "@/components/ui/button";

interface FixtureSectionProps {
  children: ReactNode;
  description: string;
  testId: string;
  title: string;
}

interface ButtonRowProps {
  children: ReactNode;
  label: string;
  labelWidth: number;
}

interface VisualTextProps {
  label: string;
  width: number;
}

function VisualText({ label, width }: VisualTextProps) {
  return (
    <>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="block h-2 shrink-0 bg-current" style={{ width }} />
    </>
  );
}

function VisualLegend({ label, width }: VisualTextProps) {
  return (
    <div className="flex h-4 items-center">
      <span className="sr-only">{label}</span>
      <span aria-hidden className="block h-2 shrink-0 bg-stone-400" style={{ width }} />
    </div>
  );
}

function FixtureSection({ children, description, testId, title }: FixtureSectionProps) {
  return (
    <section className="grid gap-4 border border-stone-300 bg-white p-5">
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        <p className="text-xs text-stone-600">{description}</p>
      </div>
      <div data-testid={testId} className="grid gap-3">
        {children}
      </div>
    </section>
  );
}

function ButtonRow({ children, label, labelWidth }: ButtonRowProps) {
  return (
    <div className="grid items-center gap-3 border border-stone-200 bg-stone-50 p-3 md:grid-cols-[11rem_1fr]">
      <VisualLegend label={label} width={labelWidth} />
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
          <h1 className="text-2xl font-semibold tracking-tight">Button Visual Fixture</h1>
          <p className="max-w-3xl text-sm text-stone-600">
            Shared button coverage for the concrete variant, size, state, and override combinations
            currently used across the app. These snapshots use zero tolerance so small silhouette
            changes fail immediately.
          </p>
        </header>

        <FixtureSection
          testId="button-visual-variants"
          title="Variants"
          description="Default-size shared variants used in product surfaces."
        >
          <ButtonRow label="default" labelWidth={50}>
            <Button>
              <VisualText label="Launch workspace" width={112} />
            </Button>
            <Button>
              <Plus />
              <VisualText label="New vault" width={64} />
            </Button>
          </ButtonRow>
          <ButtonRow label="outline" labelWidth={52}>
            <Button variant="outline">
              <VisualText label="Open preview" width={88} />
            </Button>
            <Button variant="outline">
              <ExternalLink />
              <VisualText label="Open in browser" width={104} />
            </Button>
          </ButtonRow>
          <ButtonRow label="secondary" labelWidth={70}>
            <Button variant="secondary">
              <VisualText label="Got it" width={40} />
            </Button>
          </ButtonRow>
          <ButtonRow label="ghost" labelWidth={40}>
            <Button variant="ghost">
              <VisualText label="Cancel" width={48} />
            </Button>
            <Button variant="ghost">
              <PanelLeft />
              <VisualText label="Toggle sidebar" width={96} />
            </Button>
          </ButtonRow>
          <ButtonRow label="destructive" labelWidth={74}>
            <Button variant="destructive">
              <Trash2 />
              <VisualText label="Delete vault" width={88} />
            </Button>
          </ButtonRow>
          <ButtonRow label="link" labelWidth={28}>
            <Button variant="link">
              <VisualText label="Reconnect" width={72} />
            </Button>
            <Button variant="link">
              <VisualText label="View logs" width={64} />
              <ArrowRight />
            </Button>
          </ButtonRow>
        </FixtureSection>

        <FixtureSection
          testId="button-visual-sizes"
          title="Sizes"
          description="Sizes and icon composition currently used by shared app buttons."
        >
          <ButtonRow label="default" labelWidth={50}>
            <Button>
              <VisualText label="Primary action" width={96} />
            </Button>
            <Button variant="outline">
              <VisualText label="Secondary action" width={112} />
            </Button>
          </ButtonRow>
          <ButtonRow label="sm" labelWidth={20}>
            <Button size="sm">
              <VisualText label="Compact action" width={96} />
            </Button>
            <Button size="sm" variant="outline">
              <VisualText label="Review diff" width={80} />
            </Button>
            <Button size="sm" variant="ghost">
              <VisualText label="Dismiss" width={56} />
            </Button>
          </ButtonRow>
          <ButtonRow label="icon" labelWidth={28}>
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
          <ButtonRow label="disabled" labelWidth={56}>
            <Button disabled>
              <VisualText label="Launch workspace" width={112} />
            </Button>
            <Button variant="outline" disabled>
              <VisualText label="Open preview" width={88} />
            </Button>
            <Button variant="ghost" size="sm" disabled>
              <VisualText label="Cancel" width={48} />
            </Button>
            <Button variant="destructive" disabled>
              <VisualText label="Delete vault" width={88} />
            </Button>
          </ButtonRow>
          <ButtonRow label="busy label" labelWidth={68}>
            <Button disabled>
              <LoaderCircle className="animate-spin" />
              <VisualText label="Removing..." width={72} />
            </Button>
            <Button variant="outline" disabled>
              <LoaderCircle className="animate-spin" />
              <VisualText label="Fetching logs..." width={96} />
            </Button>
          </ButtonRow>
        </FixtureSection>

        <FixtureSection
          testId="button-visual-overrides"
          title="App Overrides"
          description="Known button overrides used in the app on top of shared button styling."
        >
          <ButtonRow label="asChild" labelWidth={44}>
            <Button asChild variant="outline">
              <a href="#open-preview">
                <VisualText label="Open preview" width={88} />
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="#view-details">
                <VisualText label="View details" width={80} />
              </a>
            </Button>
            <Button asChild variant="link" size="sm">
              <a href="#retry-provider">
                <VisualText label="Retry provider" width={96} />
              </a>
            </Button>
          </ButtonRow>
          <ButtonRow label="shape overrides" labelWidth={92}>
            <Button size="sm" variant="outline" className="rounded-none">
              <VisualText label="Static SVG" width={72} />
            </Button>
            <Button size="icon" variant="secondary" className="rounded-ui">
              <MoreHorizontal />
            </Button>
          </ButtonRow>
          <ButtonRow label="layout overrides" labelWidth={90}>
            <Button size="sm" className="h-7 px-2 text-xs">
              <VisualText label="Rebase onto latest GitHub" width={136} />
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
              <VisualText label="Copy conflict bundle" width={112} />
            </Button>
            <Button variant="outline" className="w-full md:w-56">
              <VisualText label="Full width CTA" width={96} />
            </Button>
          </ButtonRow>
        </FixtureSection>
      </div>
    </div>
  );
}
