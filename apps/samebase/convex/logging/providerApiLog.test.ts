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
          CONVEX_DEPLOY_KEY: {
            value: "secret-key",
            is_secret: true,
          },
          PREVIEW_CONVEX_DEPLOY_KEY: {
            value: "preview-secret-key",
            is_secret: true,
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
    expect(message).toContain('"CONVEX_DEPLOY_KEY":"[secret]"');
    expect(message).toContain('"PREVIEW_CONVEX_DEPLOY_KEY":"[secret]"');
    expect(message).toContain('"account_id":"[redacted]"');
    expect(message).toContain('"build_command":"pnpm run build"');
    expect(message).not.toContain("secret-key");
    expect(message).not.toContain("preview-secret-key");
    expect(message).not.toContain("abc123");
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

  it("redacts the commit hash in a Cloudflare manual-build request", () => {
    const commitHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const message = formatProviderApiCallLogMessage({
      provider: "Cloudflare",
      method: "POST",
      endpoint: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/builds",
      values: {
        body: {
          branch: "main",
          commit_hash: commitHash,
          rehash_policy: "preserve",
        },
      },
    });

    expect(message).toContain('"commit_hash":"[redacted]"');
    expect(message).toContain('"rehash_policy":"preserve"');
    expect(message).not.toContain(commitHash);
  });

  it("redacts the ref in a GitHub default-branch request without redacting preference", () => {
    const message = formatProviderApiCallLogMessage({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/git/ref/{ref}",
      values: {
        params: {
          path: {
            owner: "samebase",
            repo: "samebase",
            ref: "heads/main",
            preference: "merge",
          },
        },
      },
    });

    expect(message).toContain('"ref":"[redacted]"');
    expect(message).toContain('"preference":"merge"');
    expect(message).not.toContain("heads/main");
  });

  it("omits missing request fields instead of showing undefined placeholders", () => {
    const message = formatProviderApiCallLogMessage({
      provider: "Cloudflare",
      method: "GET",
      endpoint: "/accounts/{account_id}/builds/tokens",
      values: {
        body: undefined,
        params: {
          path: {
            account_id: "abc123",
          },
          query: undefined,
        },
      },
    });

    expect(message).toContain('"account_id":"[redacted]"');
    expect(message).not.toContain("[undefined]");
    expect(message).not.toContain('"body"');
    expect(message).not.toContain('"query"');
  });
});
