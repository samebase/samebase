import { describe, expect, it } from "vite-plus/test";

import { createRepositoryContract } from "../vault/createRepositoryContract";
import { convexArgsToToolInputSchema } from "./convexSchemas";

describe("convexArgsToToolInputSchema", () => {
  it("publishes createRepository input fields directly from the Convex contract", () => {
    const inputSchema = convexArgsToToolInputSchema(
      createRepositoryContract.args,
      createRepositoryContract.mcp.inputDescriptions,
    );

    expect(inputSchema.properties).toHaveProperty("name");
    expect(inputSchema.properties).toHaveProperty("owner");
    expect(inputSchema.properties).toHaveProperty("convexProjectName");
    expect(inputSchema.properties).toHaveProperty("cloudflareWorkerName");
    expect(inputSchema.properties).toHaveProperty("description");
    expect(inputSchema.properties).toHaveProperty("private");
    expect(inputSchema.properties).not.toHaveProperty("vaultId");
    expect(inputSchema.properties).not.toHaveProperty("branch");
    expect(inputSchema.properties).not.toHaveProperty("threadId");
    expect(inputSchema.required).toEqual([
      "name",
      "owner",
      "convexProjectName",
      "cloudflareWorkerName",
    ]);
  });
});
