import { describe, expect, it } from "vite-plus/test";

import { formatProvisioningLogLine, formatProvisioningLogText } from "./provisioningLog";

describe("formatProvisioningLogLine", () => {
  it("formats timestamp, level, step, and message", () => {
    expect(
      formatProvisioningLogLine({
        createdAt: Date.UTC(2026, 4, 2, 12, 30, 5),
        level: "info",
        step: "ensure_cloudflare",
        message: "Cloudflare Worker ready.",
      }),
    ).toBe("2026-05-02T12:30:05.000Z INFO  ensure Cloudflare - Cloudflare Worker ready.");
  });
});

describe("formatProvisioningLogText", () => {
  it("joins formatted lines in source order", () => {
    expect(
      formatProvisioningLogText([
        {
          createdAt: 0,
          level: "info",
          step: "initialize_vault",
          message: "Created the initializing Noter vault.",
        },
        {
          createdAt: 1,
          level: "error",
          step: "ensure_convex",
          message: "Provisioning failed during Convex provisioning.",
        },
      ]),
    ).toBe(
      [
        "1970-01-01T00:00:00.000Z INFO  initialize vault - Created the initializing Noter vault.",
        "1970-01-01T00:00:00.001Z ERROR ensure Convex - Provisioning failed during Convex provisioning.",
      ].join("\n"),
    );
  });
});
