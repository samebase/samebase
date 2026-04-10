import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearProjectFilesCacheForTests,
  getCachedProjectFiles,
  loadProjectFilesWithSharedPromise,
  type ProjectFile,
} from "./projectFilesCache";

function buildScope(treeSHA: string) {
  return {
    vaultId: "vault_123",
    branch: "main",
    treeSHA,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("loadProjectFilesWithSharedPromise", () => {
  beforeEach(() => {
    clearProjectFilesCacheForTests();
  });

  it("shares a single in-flight fetch for identical cache keys", async () => {
    const pending = createDeferred<ProjectFile[]>();
    const load = vi.fn(async () => pending.promise);

    const firstPromise = loadProjectFilesWithSharedPromise({
      cacheKey: "vault:main:tree:repo",
      scope: buildScope("tree"),
      load,
    });
    const secondPromise = loadProjectFilesWithSharedPromise({
      cacheKey: "vault:main:tree:repo",
      scope: buildScope("tree"),
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
        scope: buildScope("tree"),
        load: async () => {
          attempts += 1;
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: "vault:main:tree:repo",
        scope: buildScope("tree"),
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
        scope: buildScope("tree"),
        load: firstLoad,
      }),
    ).resolves.toEqual(files);

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: "vault:main:tree:repo",
        scope: buildScope("tree"),
        load: secondLoad,
      }),
    ).resolves.toEqual(files);

    expect(firstLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).not.toHaveBeenCalled();
  });

  it("prunes older tree snapshots for the same vault branch", async () => {
    const oldFiles: ProjectFile[] = [{ path: "src/old.ts", content: "old" }];
    const newFiles: ProjectFile[] = [{ path: "src/new.ts", content: "new" }];
    const oldKey = "vault:main:tree-old:repo";
    const newKey = "vault:main:tree-new:repo";

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: oldKey,
        scope: buildScope("tree-old"),
        load: async () => oldFiles,
      }),
    ).resolves.toEqual(oldFiles);

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: newKey,
        scope: buildScope("tree-new"),
        load: async () => newFiles,
      }),
    ).resolves.toEqual(newFiles);

    expect(getCachedProjectFiles(oldKey)).toBeNull();
    expect(getCachedProjectFiles(newKey)).toEqual(newFiles);
  });

  it("does not repopulate cache from a stale pruned pending fetch", async () => {
    const oldPending = createDeferred<ProjectFile[]>();
    const oldFiles: ProjectFile[] = [{ path: "src/old.ts", content: "old" }];
    const newFiles: ProjectFile[] = [{ path: "src/new.ts", content: "new" }];
    const oldKey = "vault:main:tree-old:repo";
    const newKey = "vault:main:tree-new:repo";

    const oldPromise = loadProjectFilesWithSharedPromise({
      cacheKey: oldKey,
      scope: buildScope("tree-old"),
      load: async () => oldPending.promise,
    });

    await expect(
      loadProjectFilesWithSharedPromise({
        cacheKey: newKey,
        scope: buildScope("tree-new"),
        load: async () => newFiles,
      }),
    ).resolves.toEqual(newFiles);

    oldPending.resolve(oldFiles);
    await expect(oldPromise).resolves.toEqual(oldFiles);

    expect(getCachedProjectFiles(oldKey)).toBeNull();
    expect(getCachedProjectFiles(newKey)).toEqual(newFiles);
  });
});
