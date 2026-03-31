import { AppPageScrollShell } from "@/components/AppPageScrollShell";

const FIXTURE_STEPS = [
  {
    label: "Step 1",
    title: "Tall route content",
    detail: "Scroll stays inside the route frame.",
  },
  {
    label: "Step 2",
    title: "Centered card",
    detail: "Extra height stays outside the route.",
  },
  {
    label: "Step 3",
    title: "Phone-safe scrolling",
    detail: "Small screens can reach the lower steps.",
  },
  {
    label: "Step 4",
    title: "Scroll handoff",
    detail: "Hydration restores the saved scrollTop.",
  },
  {
    label: "Step 5",
    title: "No horizontal bleed",
    detail: "Overflow clips without widening the page.",
  },
  {
    label: "Step 6",
    title: "Workspace isolation",
    detail: "Workspace routes keep their full-screen layout.",
  },
] as const;

export function AppPageScrollShellVisualFixture() {
  return (
    <div className="flex min-h-screen items-start justify-center bg-stone-100 p-8 text-stone-950">
      <AppPageScrollShell
        data-testid="app-page-scroll-shell-visual-fixture"
        className="h-[360px] w-[320px] bg-background text-foreground"
      >
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Route Scroll Shell
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Scrollable route content
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              This fixture overflows on purpose so the screenshot captures a
              real scrolled route surface.
            </p>
          </div>
          {FIXTURE_STEPS.map((step) => (
            <section
              key={step.label}
              className="flex min-h-24 flex-col gap-2 border-t pt-4"
            >
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {step.label}
              </div>
              <h2 className="text-base font-medium leading-5">{step.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {step.detail}
              </p>
            </section>
          ))}
        </div>
      </AppPageScrollShell>
    </div>
  );
}
