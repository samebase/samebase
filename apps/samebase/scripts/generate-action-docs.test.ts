import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const llmsTxt = readFileSync(fileURLToPath(new URL("../public/llms.txt", import.meta.url)), "utf8");
const createRepositoryDoc = readFileSync(
  fileURLToPath(new URL("../public/docs/actions/create_repository.md", import.meta.url)),
  "utf8",
);
const getUserVaultsDoc = readFileSync(
  fileURLToPath(new URL("../public/docs/actions/get_user_vaults.md", import.meta.url)),
  "utf8",
);
const listBuildTokensDoc = readFileSync(
  fileURLToPath(new URL("../public/docs/actions/list_workers_build_tokens.md", import.meta.url)),
  "utf8",
);
const createCloudflareWorkerDoc = readFileSync(
  fileURLToPath(new URL("../public/docs/actions/create_cloudflare_worker.md", import.meta.url)),
  "utf8",
);

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

  it("documents the confirmed-empty Workers Builds token flow", () => {
    expect(createRepositoryDoc).toContain(
      "the run creates no Cloudflare Worker and stops after GitHub and Convex are ready",
    );
    expect(createRepositoryDoc).toContain(
      "It does not mean Cloudflare is complete. This\nexpected pending state is not a failure",
    );
    expect(getUserVaultsDoc).toContain(
      "providerPlan.cloudflare.buildTokenUuid is null, a ready providerSetup",
    );
    expect(getUserVaultsDoc).toContain(
      "Do not attach the\ntemporary Worker or retry the completed managed run.",
    );
    expect(listBuildTokensDoc).toContain("https://samebase.com/docs/cloudflare-setup");
    expect(listBuildTokensDoc).toContain(
      "When a Worker is already attached, keep it. After the user completes token setup",
    );
    expect(listBuildTokensDoc).toContain(
      "call vault_cloudflare_configureWorkersBuildsForGitHub for that attachment. Do not create",
    );
    expect(listBuildTokensDoc).toContain("Generic Worker creation does not");
    expect(listBuildTokensDoc).toContain("install Convex deploy keys.");
    expect(llmsTxt).toContain("[Cloudflare setup](https://samebase.com/docs/cloudflare-setup.md)");
    expect(createCloudflareWorkerDoc).toContain(
      "vault has no attached Worker, and the exact Convex project from that plan is attached",
    );
    expect(createCloudflareWorkerDoc).toContain(
      "It deletes older Samebase-named deploy keys before it creates their\nreplacements.",
    );
    expect(createCloudflareWorkerDoc).toContain(
      "For every other connected vault, the action keeps the generic behavior",
    );
    expect(createCloudflareWorkerDoc).toContain(
      "without creating, changing, or deleting Convex keys",
    );
  });
});
