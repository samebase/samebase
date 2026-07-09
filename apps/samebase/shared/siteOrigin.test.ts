import { describe, expect, it } from "vite-plus/test";

import { parseSiteOrigin } from "./siteOrigin";

describe("parseSiteOrigin", () => {
  it("accepts HTTPS origins and loopback HTTP development origins", () => {
    expect(parseSiteOrigin("https://samebase.com").origin).toBe("https://samebase.com");
    expect(parseSiteOrigin("http://localhost:5176").origin).toBe("http://localhost:5176");
    expect(parseSiteOrigin("http://127.0.0.2:5176").origin).toBe("http://127.0.0.2:5176");
    expect(parseSiteOrigin("http://[::1]:5176").origin).toBe("http://[::1]:5176");
  });

  it("rejects insecure or malformed deployment URLs", () => {
    expect(() => parseSiteOrigin("http://samebase.com")).toThrow("SITE_URL must use https");
    expect(() => parseSiteOrigin("javascript:alert(1)")).toThrow("SITE_URL must use https");
    expect(() => parseSiteOrigin("/relative")).toThrow("SITE_URL must be an absolute URL");
  });

  it("rejects credentials and any value beyond the origin", () => {
    expect(() => parseSiteOrigin("https://user:password@samebase.com")).toThrow(
      "SITE_URL must not include credentials",
    );
    expect(() => parseSiteOrigin("https://samebase.com/app")).toThrow("SITE_URL must be an origin");
    expect(() => parseSiteOrigin("https://samebase.com/?preview=1")).toThrow(
      "SITE_URL must be an origin",
    );
    expect(() => parseSiteOrigin("https://samebase.com/#preview")).toThrow(
      "SITE_URL must be an origin",
    );
  });
});
