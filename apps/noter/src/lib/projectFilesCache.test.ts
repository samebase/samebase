import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearProjectFilesCacheForTests,
  getCachedProjectFiles,
  loadProjectFilesWithSharedPromise,
  type ProjectFile,
} from "./projectFilesCache";

describe("loadProjectFilesWithSharedPromise", () => {
  beforeEach(() => {
    clearProjectFilesCacheForTests();
  });

  it("shares a single in-flight fetch for identical cache keys", async () => {
    const pending = Promise.withResolvers<ProjectFile[]>();
    const load = vi.fn(async () => pending.promise);

    const firstPromise = loadProjectFilesWithSharedPromise({
      cacheKey: "vault:main:tree:repo",
      load,
    });
    const secondPromise = loadProjectFilesWithSharedPromise({
      cacheKey: "vault:main:tree:repo",
      load,
    });

    expect(load).toHaveBeenCalledTimes(1);

    const files: ProjectFile[] = [
      { path: "src/index.ts", content: "export {}" },
    ];
    pending.resolve(files);

    await expect(firstPromise).resolves.toEqual(files);
    await expect(secondPromise).resolves.toEqual(files);
    expect(getCachedProjectFiles("vault:main:tree:repo")).toEqual(files);
  });

  it("clears failed in-flight entries so retries can load again", async () => {
    let attempts = 0;
    const files: ProjectFile[] = [{ path: "src/app.ts", content: "export {}" }];

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: "vault:main:tree:repo",
        load: async () => {
          attempts += 1;
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: "vault:main:tree:repo",
        load: async () => {
          attempts += 1;
          return files;
        },
      }),
    ).resolves.toEqual(files);

    expect(attempts).toBe(2);
    expect(getCachedProjectFiles("vault:main:tree:repo")).toEqual(files);
  });

  it("serves cached files without re-invoking the loader", async () => {
    const files: ProjectFile[] = [{ path: "src/lib.ts", content: "export {}" }];
    const firstLoad = vi.fn(async () => files);
    const secondLoad = vi.fn(async () => {
      throw new Error("loader should not run when cache is warm");
    });

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: "vault:main:tree:repo",
        load: firstLoad,
      }),
    ).resolves.toEqual(files);

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: "vault:main:tree:repo",
        load: secondLoad,
      }),
    ).resolves.toEqual(files);

    expect(firstLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).not.toHaveBeenCalled();
  });
});
