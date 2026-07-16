import { describe, expect, it } from "vite-plus/test";
import { buildVaultCloudflareBuildConfig } from "./model";

describe("buildVaultCloudflareBuildConfig", () => {
  it("watches the complete repository when the Worker or a dependency is rooted there", () => {
    expect(
      buildVaultCloudflareBuildConfig({
        rootDirectory: "/",
        dependencyRootDirectories: ["packages/backend"],
      }),
    ).toEqual({
      rootDirectory: "/",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: ["*"],
      pathExcludes: [],
    });

    expect(
      buildVaultCloudflareBuildConfig({
        rootDirectory: "apps/web",
        dependencyRootDirectories: ["/"],
      }).pathIncludes,
    ).toEqual(["*"]);
  });

  it("watches the Worker, every dependency, and shared workspace build files", () => {
    expect(
      buildVaultCloudflareBuildConfig({
        rootDirectory: "apps/web",
        dependencyRootDirectories: ["packages/backend", "apps/mobile", "packages/backend"],
      }),
    ).toEqual({
      rootDirectory: "apps/web",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: [
        "apps/web/*",
        ".node-version",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "apps/mobile/*",
        "packages/backend/*",
      ],
      pathExcludes: [],
    });
  });
});
