import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import machineConnectVisualFixtureMarkdown from "../content/machine-connect-visual-fixture.md?raw";

export function MachineConnectVisualFixture() {
  return (
    <div
      data-testid="machine-connect-visual-fixture"
      className="min-h-screen bg-background px-8 py-12 text-foreground"
    >
      <div className="mx-auto max-w-3xl">
        <ProsemarkReadOnly
          value={machineConnectVisualFixtureMarkdown}
          className="text-sm"
        />
      </div>
    </div>
  );
}
