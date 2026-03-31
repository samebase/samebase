import { MachineConnectPageContent } from "@/components/MachineConnectPage";

export function MachineConnectVisualFixture() {
  return (
    <div
      data-testid="machine-connect-visual-fixture"
      className="min-h-screen bg-background text-foreground"
    >
      <MachineConnectPageContent
        approvalError="Machine registration request expired."
        connectedMachines={[
          {
            allowedRoots: ["/Users/nicu/.codex/worktrees/6f41/noter"],
            capabilities: ["presence"],
            connectorVersion: "noter-sync 0.1.0",
            displayName: "Nicu MacBook Pro",
            hostname: "nicu-mbp.local",
            lastSeenAt: 1_775_379_520_000,
            machineId: "machine_123",
            os: "macos",
            status: "online",
          },
        ]}
        directConnectCommand={`curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`}
        directRunCommand={`curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`}
        heartbeatLog={`[10:20:00 AM] observing Nicu MacBook Pro (nicu-mbp.local); last ping seen, currently online.
[10:20:15 AM] heartbeat from Nicu MacBook Pro (nicu-mbp.local).
[10:20:30 AM] heartbeat from Nicu MacBook Pro (nicu-mbp.local).`}
        isApproving={false}
        openedByCli
        packageConnectCommand="npx @noter-md/sync connect"
        packageRunCommand="npx @noter-md/sync run"
        requestState={{
          kind: "pending",
          connectorVersion: "noter-sync (codex 0.1.2)",
          displayName: "Nicu MacBook Pro",
          expiresAt: 1_775_379_420_000,
          hostname: "nicu-mbp.local",
          machineId: "machine_123",
          os: "macos",
        }}
        scriptUrl="https://noter.md/noter.js"
      />
    </div>
  );
}
