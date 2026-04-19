import { AppPageFrame } from "@/components/AppPageFrame";
import { AppPerformanceHudFixture } from "@/components/AppPerformanceHud";

export function AppPerformanceHudVisualFixture() {
  return (
    <AppPageFrame
      dataTestId="app-performance-hud-visual-fixture"
      bottomBar={
        <div className="ml-auto flex h-full items-center">
          <AppPerformanceHudFixture />
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background" />
    </AppPageFrame>
  );
}
