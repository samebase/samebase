// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultOverviewVaultPickerPane } from "./VaultOverviewVaultPickerPane";

const getInstallationUrl = vi.hoisted(() =>
  vi.fn(async () => "https://github.com/apps/samebase/installations/new"),
);
const openSetupPopup = vi.hoisted(() =>
  vi.fn(async (getSetupUrl: () => Promise<string>) => await getSetupUrl()),
);

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: () => getInstallationUrl,
  };
});

vi.mock("@/lib/githubAppSetupFlow", () => ({
  openGitHubAppSetupPopup: openSetupPopup,
}));

describe("VaultOverviewVaultPickerPane organization setup", () => {
  it("returns GitHub App installation to the global vault inventory", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <TestRouterProvider initialEntries={["/vault"]}>
            <VaultOverviewVaultPickerPane
              globalInventory
              organizations={[]}
              sidebarSummaries={{ state: "loaded", summaries: [] }}
              vaults={[]}
            />
          </TestRouterProvider>,
        );
      });
      const installButton = [...rootElement.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Install GitHub App",
      );
      if (!installButton) {
        throw new Error("Install GitHub App button not found");
      }

      await act(async () => installButton.click());

      expect(openSetupPopup).toHaveBeenCalledOnce();
      expect(getInstallationUrl).toHaveBeenCalledWith({ returnToPath: "/vault" });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
