import { renderToStaticMarkup } from "react-dom/server";
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
});
