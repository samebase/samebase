import { describe, expect, it } from "vite-plus/test";

import { formatProviderApiCallLogMessage } from "./providerApiLog";

describe("formatProviderApiCallLogMessage", () => {
  it("shows endpoint templates and redacts identifiers, PII, and secrets", () => {
    const message = formatProviderApiCallLogMessage({
      provider: "Cloudflare",
      method: "post",
      endpoint: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables",
      values: {
        body: {
          PROD_CONVEX_DEPLOY_KEY: {
            value: "secret-key",
            is_secret: true,
          },
          VITE_CONVEX_URL: {
            value: "https://example.convex.cloud",
            is_secret: false,
          },
          build_command: "pnpm run build",
          private: true,
        },
        params: {
          path: {
            account_id: "abc123",
            trigger_uuid: "trigger-123",
          },
        },
      },
    });

    expect(message).toContain(
      "API Cloudflare POST /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables values=",
    );
    expect(message).toContain('"PROD_CONVEX_DEPLOY_KEY":"[secret]"');
    expect(message).toContain('"value":"[redacted]"');
    expect(message).toContain('"account_id":"[redacted]"');
    expect(message).toContain('"build_command":"pnpm run build"');
    expect(message).not.toContain("secret-key");
    expect(message).not.toContain("abc123");
    expect(message).not.toContain("example.convex.cloud");
  });

  it("summarizes large arrays and file contents", () => {
    expect(
      formatProviderApiCallLogMessage({
        provider: "GitHub",
        method: "POST",
        endpoint: "/repos/{owner}/{repo}/git/trees",
        values: {
          body: {
            tree: Array.from({ length: 14 }, (_, index) => ({
              path: `file-${index}.ts`,
              content: `source ${index}`,
            })),
          },
        },
      }),
    ).toContain('"[2 more items redacted]"');
  });
});
