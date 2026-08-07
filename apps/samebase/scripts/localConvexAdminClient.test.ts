import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { createLocalConvexAdminClient } from "./localConvexAdminClient.ts";

describe("createLocalConvexAdminClient", () => {
  it("rejects a file that is not a local Convex config", async () => {
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));

    await expect(createLocalConvexAdminClient(packagePath)).rejects.toThrowError(
      "Invalid local Convex config: " + packagePath,
    );
  });
});
