import { describe, expect, it } from "vite-plus/test";
import { buildVaultCloudflareBuildConfigForAppRoot } from "./model";

describe("buildVaultCloudflareBuildConfigForAppRoot", () => {
  it("watches the complete repository for a root app", () => {
    expect(buildVaultCloudflareBuildConfigForAppRoot({ appRoot: "." })).toEqual({
      rootDirectory: "/",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: ["*"],
      pathExcludes: [],
    });
  });

  it("watches one monorepo app and the shared workspace build files", () => {
    expect(buildVaultCloudflareBuildConfigForAppRoot({ appRoot: "apps/alpha" })).toEqual({
      rootDirectory: "apps/alpha",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: [
        "apps/alpha/*",
        ".node-version",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
      ],
      pathExcludes: [],
    });
  });
});
