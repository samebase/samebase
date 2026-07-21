// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { VaultRepositoryRootInput } from "./VaultRepositoryRootInput";

function RepositoryRootInputProbe() {
  const [value, setValue] = useState("");

  return (
    <VaultRepositoryRootInput
      disabled={false}
      folderSuggestions={["apps/admin", "apps/portal", "packages/shared"]}
      onValueChange={setValue}
      value={value}
    />
  );
}

describe("VaultRepositoryRootInput", () => {
  it("shows repository folders before the user types and selects one", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(<RepositoryRootInputProbe />);
      });

      const input = rootElement.querySelector("input");
      if (!input) {
        throw new Error("Expected repository root input.");
      }

      await act(async () => {
        input.focus();
      });

      expect(input.value).toBe("");
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(
        [...rootElement.querySelectorAll('[role="option"]')].map((option) => option.textContent),
      ).toEqual(["apps/admin", "apps/portal", "packages/shared"]);

      const portalOption = [
        ...rootElement.querySelectorAll<HTMLButtonElement>('[role="option"]'),
      ].find((option) => option.textContent === "apps/portal");
      if (!portalOption) {
        throw new Error("Expected apps/portal suggestion.");
      }

      await act(async () => {
        portalOption.click();
      });

      expect(input.value).toBe("apps/portal");
      expect(input.getAttribute("aria-expanded")).toBe("false");
    } finally {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    }
  });
});
