import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const llmsTxt = readFileSync(fileURLToPath(new URL("../public/llms.txt", import.meta.url)), "utf8");

describe("generated action documentation", () => {
  it("defines authentication and provider-state boundaries", () => {
    expect(llmsTxt).toContain("Every Samebase action checks its own authentication.");
    expect(llmsTxt).toContain("Authentication status is a diagnostic action,\nnot a preflight.");
    expect(llmsTxt).toContain(
      "Inventory reports Samebase-owned workflow state and stable resource IDs.",
    );
    expect(llmsTxt).toContain(
      "Use provider-native tools to verify\ncurrent provider existence, configuration, deployment state, and logs",
    );
  });
});
