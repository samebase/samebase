import { describe, expect, it } from "vitest";
import {
  buildRecoveryReloadUrl,
  isLikelyStaleAssetError,
  stripRecoveryReloadParam,
} from "@/lib/appBootRecovery";

describe("appBootRecovery", () => {
  it("recognizes stale chunk and dynamic import failures", () => {
    expect(
      isLikelyStaleAssetError(
        new Error("Failed to fetch dynamically imported module"),
      ),
    ).toBe(true);
    expect(isLikelyStaleAssetError(new Error("Loading chunk 42 failed."))).toBe(
      true,
    );
    expect(isLikelyStaleAssetError(new Error("Network timeout"))).toBe(false);
  });

  it("adds a cache-busting recovery query param", () => {
    const reloadedUrl = new URL(
      buildRecoveryReloadUrl(new URL("https://noter.md/?devtools=true")),
    );

    expect(reloadedUrl.searchParams.get("devtools")).toBe("true");
    expect(reloadedUrl.searchParams.has("__noter-reload")).toBe(true);
  });

  it("removes the cache-busting recovery query param without dropping others", () => {
    const strippedUrl = new URL(
      stripRecoveryReloadParam(
        new URL("https://noter.md/?devtools=true&__noter-reload=123"),
      ),
    );

    expect(strippedUrl.searchParams.get("devtools")).toBe("true");
    expect(strippedUrl.searchParams.has("__noter-reload")).toBe(false);
  });
});
