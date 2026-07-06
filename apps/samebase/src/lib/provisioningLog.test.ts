import { describe, expect, it } from "vite-plus/test";

import {
  buildProvisioningLogDocumentEvents,
  formatProvisioningLogApiValues,
  formatProvisioningLogLine,
  formatProvisioningLogText,
} from "./provisioningLog";

describe("formatProvisioningLogLine", () => {
  it("formats timestamp, level, step, and message", () => {
    expect(
      formatProvisioningLogLine({
        createdAt: Date.UTC(2026, 4, 2, 12, 30, 5),
        level: "info",
        step: "attach_worker",
        message: "Cloudflare Worker ready.",
      }),
    ).toBe("2026-05-02T12:30:05.000Z INFO  attach Worker - Cloudflare Worker ready.");
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
          message: "Created the initializing Samebase vault.",
        },
        {
          createdAt: 1,
          level: "error",
          step: "attach_convex",
          message: "Provisioning failed during Convex provisioning.",
        },
      ]),
    ).toBe(
      [
        "1970-01-01T00:00:00.000Z INFO  initialize vault - Created the initializing Samebase vault.",
        "1970-01-01T00:00:00.001Z ERROR attach Convex - Provisioning failed during Convex provisioning.",
      ].join("\n"),
    );
  });
});

describe("buildProvisioningLogDocumentEvents", () => {
  it("turns API log messages into structured provider calls", () => {
    expect(
      buildProvisioningLogDocumentEvents([
        {
          createdAt: Date.UTC(2026, 4, 2, 12, 30, 5),
          level: "info",
          step: "attach_worker",
          message:
            'API Cloudflare PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables values={"body":{"PROD_CONVEX_DEPLOY_KEY":"[secret]","build_command":"pnpm run build"},"params":{"path":{"account_id":"[redacted]"}}}',
        },
      ]),
    ).toEqual([
      {
        time: "2026-05-02T12:30:05.000Z",
        level: "info",
        step: "attach Worker",
        api: {
          provider: "Cloudflare",
          method: "PATCH",
          endpoint: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables",
          values: {
            body: {
              PROD_CONVEX_DEPLOY_KEY: "[secret]",
              build_command: "pnpm run build",
            },
            params: {
              path: {
                account_id: "[redacted]",
              },
            },
          },
        },
      },
    ]);
  });

  it("keeps non-API messages readable", () => {
    expect(
      buildProvisioningLogDocumentEvents([
        {
          createdAt: 0,
          level: "warn",
          step: "validate_connections",
          message: "Cloudflare connection is missing.",
        },
      ]),
    ).toEqual([
      {
        time: "1970-01-01T00:00:00.000Z",
        level: "warn",
        step: "validate connections",
        message: "Cloudflare connection is missing.",
      },
    ]);
  });
});

describe("formatProvisioningLogApiValues", () => {
  it("formats request values for the per-call editor", () => {
    expect(
      formatProvisioningLogApiValues({
        provider: "GitHub",
        method: "POST",
        endpoint: "/user/repos",
        values: {
          body: {
            auto_init: false,
            name: "[redacted]",
          },
        },
      }),
    ).toBe(
      JSON.stringify(
        {
          body: {
            auto_init: false,
            name: "[redacted]",
          },
        },
        null,
        2,
      ),
    );
  });

  it("shows an empty object when the call has no values", () => {
    expect(
      formatProvisioningLogApiValues({
        provider: "Convex",
        method: "GET",
        endpoint: "/teams/{team_id}",
      }),
    ).toBe("{}");
  });
});
