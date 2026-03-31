import { MachineConnectPageContent } from "@/components/MachineConnectPage";
import { MemoryRouter } from "react-router-dom";

export function MachineConnectVisualFixture() {
  return (
    <MemoryRouter>
      <div
        data-testid="machine-connect-visual-fixture"
        className="min-h-screen bg-background text-foreground"
        // Pin the fixture bounds so Linux and macOS capture the same screenshot.
        style={{ minHeight: 1341 }}
      >
        <MachineConnectPageContent
          approvalError="Machine registration request expired."
          connectedMachines={[
            {
              allowedRoots: ["/Users/nicu/.codex/worktrees/6f41/noter"],
              capabilities: ["presence", "liveControl"],
              connectorVersion: "noter-sync 0.1.0",
              controlStatus: "ready",
              controlStatusDetail: "Live control ready.",
              controlUrl: "https://machine-live-control.trycloudflare.com",
              controlUrlUpdatedAt: 1_775_379_530_000,
              displayName: "Nicu Windows Workstation",
              hostname: "nicu-win.local",
              lastSeenAt: 1_775_379_520_000,
              machineId: "machine_123",
              os: "macos",
              status: "online",
            },
          ]}
          directConnectCommand={`curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`}
          directRunCommand={`curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`}
          heartbeatLog={`[10:20:00 AM] observing Nicu Windows Workstation (nicu-win.local); last ping seen, currently online.
[10:20:15 AM] heartbeat from Nicu Windows Workstation (nicu-win.local).
[10:20:30 AM] heartbeat from Nicu Windows Workstation (nicu-win.local).`}
          isApproving={false}
          openedByCli
          packageConnectCommand="npx @noter-md/sync connect"
          packageRunCommand="npx @noter-md/sync run"
          requestState={{
            kind: "pending",
            connectorVersion: "noter-sync (codex 0.1.2)",
            displayName: "Nicu Windows Workstation",
            expiresAt: 1_775_379_420_000,
            hostname: "nicu-win.local",
            machineId: "machine_123",
            os: "windows",
          }}
          scriptUrl="https://noter.md/noter.js"
        />
      </div>
    </MemoryRouter>
  );
}
