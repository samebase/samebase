import { describe, expect, it } from "vite-plus/test";
import { isDevModeEnabled } from "@/lib/devMode";

describe("devMode", () => {
  it("reads dev mode by key presence", () => {
    expect(isDevModeEnabled({ dev: false })).toBe(true);
    expect(isDevModeEnabled({ dev: "false" })).toBe(true);
    expect(isDevModeEnabled({ dev: undefined })).toBe(false);
    expect(isDevModeEnabled({ dev: null })).toBe(false);
    expect(isDevModeEnabled({})).toBe(false);
  });
});
