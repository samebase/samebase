import { AppPageScrollShell } from "@/components/AppPageScrollShell";

const FIXTURE_STEPS = [
  "Open a route with content taller than the viewport.",
  "Keep the card centered when the viewport still has room.",
  "Scroll downward on a smaller laptop or phone screen.",
  "Carry the same scroll offset through the landing handoff.",
  "Clip any horizontal overflow instead of widening the page.",
  "Leave Layout untouched so workspace routes stay full-screen.",
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
              This fixture keeps the shell height fixed and intentionally
              overflows its content so screenshot tests can exercise real scroll
              behavior.
            </p>
          </div>
          {FIXTURE_STEPS.map((step, index) => (
            <section key={step} className="flex flex-col gap-2 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Step {index + 1}
              </div>
              <p className="text-sm leading-6">{step}</p>
            </section>
          ))}
        </div>
      </AppPageScrollShell>
    </div>
  );
}
