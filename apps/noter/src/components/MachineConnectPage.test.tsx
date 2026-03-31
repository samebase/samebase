import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MachineConnectPageContent } from "./MachineConnectPage";

describe("MachineConnectPageContent", () => {
  it("renders approval errors so failed handoffs are visible in the browser", () => {
    const markup = renderToStaticMarkup(
      <MachineConnectPageContent
        approvalError="Machine registration request expired."
        connectedMachines={[]}
        directConnectCommand="curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'"
        directRunCommand="curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run"
        heartbeatLog=""
        isApproving={false}
        openedByCli
        packageConnectCommand="npx @noter-md/sync connect"
        packageRunCommand="npx @noter-md/sync run"
        requestState={{
          kind: "pending",
          connectorVersion: "noter-sync (codex 0.1.0)",
          displayName: "Research MacBook Pro",
          expiresAt: 1_775_379_420_000,
          hostname: "research-mbp.local",
          machineId: "machine_fixture",
          os: "macos",
        }}
        scriptUrl="https://noter.md/noter.js"
      />,
    );

    expect(markup).toContain("Machine registration request expired.");
    expect(markup).toContain("border-red-200");
  });

  it("shows a live-control entrypoint for ready machines", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <MachineConnectPageContent
          approvalError={null}
          connectedMachines={[
            {
              allowedRoots: ["/Users/nicu/.codex/worktrees/f7c6/noter"],
              capabilities: ["presence", "liveControl"],
              connectorVersion: "noter-sync 0.1.0",
              controlStatus: "ready",
              controlStatusDetail: "Live control ready.",
              controlUrl: "https://machine-live-control.trycloudflare.com",
              controlUrlUpdatedAt: 1_775_379_530_000,
              displayName: "Research MacBook Pro",
              hostname: "research-mbp.local",
              lastSeenAt: 1_775_379_520_000,
              machineId: "machine_fixture",
              os: "macos",
              status: "online",
            },
          ]}
          directConnectCommand="curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'"
          directRunCommand="curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run"
          heartbeatLog=""
          isApproving={false}
          openedByCli={false}
          packageConnectCommand="npx @noter-md/sync connect"
          packageRunCommand="npx @noter-md/sync run"
          requestState={{ kind: "idle" }}
          scriptUrl="https://noter.md/noter.js"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Open live control");
    expect(markup).toContain("/machines/machine_fixture/live");
  });
});
