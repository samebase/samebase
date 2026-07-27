import { describe, expect, it } from "vite-plus/test";

import { synchronizeExportManifest } from "./sync-repository-export-packages.ts";

describe("repository export package synchronization", () => {
  it("copies the package manager and shared dependency versions", () => {
    const result = synchronizeExportManifest(
      {
        packageManager: "pnpm@11.9.0",
        dependencies: {
          react: "19.2.4",
        },
        devDependencies: {
          "vite-plus": "0.1.24",
        },
      },
      {
        name: "exported-package",
        packageManager: "pnpm@11.0.0",
        dependencies: {
          react: "19.1.0",
        },
        peerDependencies: {
          react: "^19.0.0",
        },
        devDependencies: {
          "@types/node": "20.19.32",
          "vite-plus": "0.1.20",
        },
      },
    );

    expect(result).toEqual({
      name: "exported-package",
      packageManager: "pnpm@11.9.0",
      dependencies: {
        react: "19.2.4",
      },
      peerDependencies: {
        react: "^19.0.0",
      },
      devDependencies: {
        "@types/node": "20.19.32",
        "vite-plus": "0.1.24",
      },
    });
  });

  it("rejects shared workspace dependencies that cannot install after export", () => {
    expect(() =>
      synchronizeExportManifest(
        {
          packageManager: "pnpm@11.9.0",
          dependencies: {
            "@samebase/internal": "workspace:*",
          },
        },
        {
          dependencies: {
            "@samebase/internal": "1.0.0",
          },
        },
      ),
    ).toThrow("cannot use the monorepo-only version workspace:*");
  });
});
