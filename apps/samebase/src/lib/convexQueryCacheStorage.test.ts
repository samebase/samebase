import { describe, expect, it, vi } from "vite-plus/test";
import {
  closeConvexQueryCacheDatabases,
  registerConvexQueryCacheDatabase,
  releaseConvexQueryCacheDatabase,
} from "./convexQueryCacheStorage";

function createDatabase() {
  return {
    close: vi.fn(),
    onversionchange: null,
  };
}

describe("Convex query cache storage", () => {
  it("closes every registered database before account data is erased", () => {
    const first = createDatabase();
    const second = createDatabase();

    // @ts-expect-error The test database implements the connection members used by the registry.
    registerConvexQueryCacheDatabase(first);
    // @ts-expect-error The test database implements the connection members used by the registry.
    registerConvexQueryCacheDatabase(second);

    closeConvexQueryCacheDatabases();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it("releases completed connections from the registry", () => {
    const database = createDatabase();

    // @ts-expect-error The test database implements the connection members used by the registry.
    registerConvexQueryCacheDatabase(database);
    // @ts-expect-error The test database implements the connection members used by the registry.
    releaseConvexQueryCacheDatabase(database);
    closeConvexQueryCacheDatabases();

    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
