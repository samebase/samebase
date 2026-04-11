import { AppBootFailureState } from "@/components/AppBootFailureState";

function FixtureCase({ testId, error }: { testId: string; error: Error }) {
  return (
    <section
      data-testid={testId}
      className="overflow-hidden border border-stone-300 bg-background"
    >
      <AppBootFailureState error={error} />
    </section>
  );
}

export function AppBootFailureStateVisualFixture() {
  return (
    <div className="grid gap-8 bg-stone-100 p-8 text-stone-950">
      <header className="grid gap-2 border border-stone-300 bg-white p-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          App Boot Failure Visual Fixture
        </h1>
        <p className="max-w-3xl text-sm text-stone-600">
          Visual coverage for the two shipped recovery states: stale deploy
          assets and generic startup failure.
        </p>
      </header>

      <FixtureCase
        testId="app-boot-failure-stale"
        error={new Error("Failed to fetch dynamically imported module")}
      />
      <FixtureCase
        testId="app-boot-failure-generic"
        error={new Error("Unexpected token")}
      />
    </div>
  );
}
