import { MachineConnectPageContent } from "@/components/MachineConnectPage";

export function MachineConnectVisualFixture() {
  return (
    <div
      data-testid="machine-connect-visual-fixture"
      className="h-screen overflow-hidden bg-background text-foreground"
    >
      <MachineConnectPageContent
        connectedMachines={[
          {
            connectorVersion: "noter-sync 0.1.0",
            displayName: "Nicu MacBook Pro",
            hostname: "nicu-mbp.local",
            machineId: "machine_123",
            status: "online",
          },
        ]}
        directConnectCommand={`SCRIPT_URL='https://noter.md/noter.js'; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\\n' "$SCRIPT_CONTENT" | node --input-type=module - connect "$SCRIPT_URL"`}
        directRunCommand={`SCRIPT_URL='https://noter.md/noter.js'; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\\n' "$SCRIPT_CONTENT" | node --input-type=module - run`}
        isApproving={false}
        openedByCli
        packageConnectCommand="npx @noter-md/sync connect"
        packageRunCommand="npx @noter-md/sync run"
        requestState={{
          kind: "approved",
          connectorVersion: "codex 0.1.2",
          displayName: "Nicu MacBook Pro",
          hostname: "nicu-mbp.local",
          machineId: "machine_123",
          os: "macos",
        }}
        scriptUrl="https://noter.md/noter.js"
      />
    </div>
  );
}
