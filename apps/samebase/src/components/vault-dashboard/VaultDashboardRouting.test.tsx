// @vitest-environment jsdom

import { useLocation } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultDashboardDeleteControl } from "./VaultDashboard";

function LocationProbe() {
  const location = useLocation();

  return (
    <output
      data-testid="location-probe"
      data-search={JSON.stringify(location.search)}
      data-state={JSON.stringify(location.state)}
    />
  );
}

describe("vault dashboard dialog routing", () => {
  it("marks an ordinary delete-dialog navigation as an in-app history entry", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <TestRouterProvider initialEntries={["/vault/samebase/samebase?devtools"]}>
            <VaultDashboardDeleteControl
              repositoryFullName="samebase/samebase"
              deleteAction={{ state: "available" }}
            />
            <LocationProbe />
          </TestRouterProvider>,
        );
      });

      const deleteLink = rootElement.querySelector("a");
      if (!deleteLink) {
        throw new Error("Delete link did not render.");
      }

      await act(async () => {
        deleteLink.click();
      });

      const locationProbe = rootElement.querySelector('[data-testid="location-probe"]');
      expect(JSON.parse(locationProbe?.getAttribute("data-search") ?? "{}")).toEqual({
        delete: "",
        devtools: "",
      });
      expect(JSON.parse(locationProbe?.getAttribute("data-state") ?? "{}")).toMatchObject({
        vaultDashboardDialog: "delete",
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    }
  });
});
