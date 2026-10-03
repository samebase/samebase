import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const llmsTxt = readFileSync(fileURLToPath(new URL("../public/llms.txt", import.meta.url)), "utf8");

describe("generated action documentation", () => {
  it("defines authentication and provider-state boundaries", () => {
    expect(llmsTxt).toContain("Every Samebase action checks its own authentication.");
    expect(llmsTxt).toContain("Authentication status is a diagnostic action,\nnot a preflight.");
    expect(llmsTxt).toContain(
      "The repository list reports Samebase-owned workflow state and the names of attached resources.",
    );
    expect(llmsTxt).toContain(
      "Use provider-native\ntools to verify current provider existence, configuration, deployment state, and logs",
    );
  });

  it("identifies the public plugin marketplace without implying an npm package", () => {
    expect(llmsTxt).toContain("[samebase/plugin](https://github.com/samebase/plugin) marketplace");
    expect(llmsTxt).toContain(
      "`samebase@samebase`. That value means the `samebase` plugin from the `samebase` marketplace.",
    );
    expect(llmsTxt).toContain("It is not an npm package name.");
  });
});
