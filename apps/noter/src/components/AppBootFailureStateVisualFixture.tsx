import { AppBootFailureState } from "@/components/AppBootFailureState";

export type AppBootFailureStateVisualMode =
  | "app-boot-failure-stale"
  | "app-boot-failure-generic";

/**
 * These exact message strings intentionally drive the stale-vs-generic
 * recovery branch. Do not change or localize them without updating the fixture.
 */
const APP_BOOT_FAILURE_FIXTURE_ERRORS = {
  "app-boot-failure-stale": "Failed to fetch dynamically imported module",
  "app-boot-failure-generic": "Unexpected token",
} as const satisfies Record<AppBootFailureStateVisualMode, string>;

export function AppBootFailureStateVisualFixture({
  mode,
}: {
  mode: AppBootFailureStateVisualMode;
}) {
  return (
    <AppBootFailureState
      error={new Error(APP_BOOT_FAILURE_FIXTURE_ERRORS[mode])}
    />
  );
}
