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
        directConnectCommands={[
          {
            command:
              "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'",
            description:
              "Use this today in Terminal, zsh, bash, fish, or another Unix shell.",
            label: "Direct hosted file connect (Unix/macOS)",
          },
          {
            command:
              "curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'",
            description:
              "Use this today in Windows PowerShell. `curl.exe` avoids the built-in `Invoke-WebRequest` alias.",
            label: "Direct hosted file connect (Windows PowerShell)",
          },
        ]}
        directRunCommands={[
          {
            command:
              "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
            description:
              "Use this today in Terminal, zsh, bash, fish, or another Unix shell.",
            label: "Direct hosted file run (Unix/macOS)",
          },
          {
            command:
              "curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
            description:
              "Use this today in Windows PowerShell. `curl.exe` avoids the built-in `Invoke-WebRequest` alias.",
            label: "Direct hosted file run (Windows PowerShell)",
          },
        ]}
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
    expect(markup).toContain("Local requirements");
    expect(markup).toContain("node --version");
    expect(markup).toContain("codex --version");
    expect(markup).toContain("nvm install --lts");
    expect(markup).toContain("OpenJS.NodeJS.LTS");
    expect(markup).toContain("npm install -g @openai/codex");
    expect(markup).toContain("desktop app alone does not guarantee");
    expect(markup).toContain("native Windows CLI support as experimental");
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
          directConnectCommands={[
            {
              command:
                "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'",
              description:
                "Use this today in Terminal, zsh, bash, fish, or another Unix shell.",
              label: "Direct hosted file connect (Unix/macOS)",
            },
            {
              command:
                "curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'",
              description:
                "Use this today in Windows PowerShell. `curl.exe` avoids the built-in `Invoke-WebRequest` alias.",
              label: "Direct hosted file connect (Windows PowerShell)",
            },
          ]}
          directRunCommands={[
            {
              command:
                "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
              description:
                "Use this today in Terminal, zsh, bash, fish, or another Unix shell.",
              label: "Direct hosted file run (Unix/macOS)",
            },
            {
              command:
                "curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
              description:
                "Use this today in Windows PowerShell. `curl.exe` avoids the built-in `Invoke-WebRequest` alias.",
              label: "Direct hosted file run (Windows PowerShell)",
            },
          ]}
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
    expect(markup).toContain("Your machine list lives on this page");
    expect(markup).toContain('href="#connected-machines"');
  });

  it("renders both Unix/macOS and Windows direct command variants", () => {
    const markup = renderToStaticMarkup(
      <MachineConnectPageContent
        approvalError={null}
        connectedMachines={[]}
        directConnectCommands={[
          {
            command:
              "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'",
            description:
              "Use this today in Terminal, zsh, bash, fish, or another Unix shell.",
            label: "Direct hosted file connect (Unix/macOS)",
          },
          {
            command:
              "curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'",
            description:
              "Use this today in Windows PowerShell. `curl.exe` avoids the built-in `Invoke-WebRequest` alias.",
            label: "Direct hosted file connect (Windows PowerShell)",
          },
        ]}
        directRunCommands={[
          {
            command:
              "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
            description:
              "Use this today in Terminal, zsh, bash, fish, or another Unix shell.",
            label: "Direct hosted file run (Unix/macOS)",
          },
          {
            command:
              "curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
            description:
              "Use this today in Windows PowerShell. `curl.exe` avoids the built-in `Invoke-WebRequest` alias.",
            label: "Direct hosted file run (Windows PowerShell)",
          },
        ]}
        heartbeatLog=""
        isApproving={false}
        openedByCli={false}
        packageConnectCommand="npx @noter-md/sync connect"
        packageRunCommand="npx @noter-md/sync run"
        requestState={{
          kind: "approved",
          connectorVersion: "noter-sync (codex 0.1.0)",
          displayName: "Research Windows Workstation",
          hostname: "research-win.local",
          machineId: "machine_fixture",
          os: "windows",
        }}
        scriptUrl="https://noter.md/noter.js"
      />,
    );

    expect(markup).toContain("Direct hosted file connect (Unix/macOS)");
    expect(markup).toContain("Direct hosted file connect (Windows PowerShell)");
    expect(markup).toContain("Direct hosted file run (Unix/macOS)");
    expect(markup).toContain("Direct hosted file run (Windows PowerShell)");
    expect(markup).toContain("curl -fsSL");
    expect(markup).toContain("curl.exe -fsSL");
  });
});
