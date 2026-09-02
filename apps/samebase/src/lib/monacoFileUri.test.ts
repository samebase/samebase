import { describe, expect, it } from "vite-plus/test";

import { buildMonacoFileUri } from "./monacoFileUri";

describe("buildMonacoFileUri", () => {
  it("encodes branch as a single URI segment", () => {
    const uri = buildMonacoFileUri({
      repositoryId: "repository_123",
      branch: "feature/foo",
      filePath: "src/index.ts",
    });

    expect(uri).toBe("file:///repository_123/feature%2Ffoo/src/index.ts");
  });

  it("keeps branch/file boundaries distinct", () => {
    const left = buildMonacoFileUri({
      repositoryId: "repository_123",
      branch: "feature/foo",
      filePath: "bar.ts",
    });
    const right = buildMonacoFileUri({
      repositoryId: "repository_123",
      branch: "feature",
      filePath: "foo/bar.ts",
    });

    expect(left).not.toBe(right);
  });
});
