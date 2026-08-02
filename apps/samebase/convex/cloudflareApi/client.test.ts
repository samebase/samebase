import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { requestCloudflareApi, resolveCloudflareApiTransport } from "./client";
import { cloudflareApiResponseValidators } from "./validators.generated";

describe("Cloudflare API transport", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    { authMethod: "oauth", transport: "direct" },
    { authMethod: "api_key", transport: "direct" },
    { authMethod: "mcp_oauth", transport: "mcp" },
  ] as const)("uses $transport for $authMethod", ({ authMethod, transport }) => {
    expect(resolveCloudflareApiTransport(authMethod)).toBe(transport);
  });

  it("times out direct response bodies after 30 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        if (!init?.signal) {
          throw new Error("Expected a Cloudflare API abort signal.");
        }
        const signal = init.signal;
        const body = new ReadableStream({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => controller.error(new DOMException("The operation was aborted.", "AbortError")),
              { once: true },
            );
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const assertion = expect(
      requestCloudflareApi({
        token: "cloudflare-token",
        transport: "direct",
        method: "GET",
        path: "/accounts",
      }),
    ).rejects.toThrow("Cloudflare API request timed out after 30000ms.");

    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});

describe("Cloudflare API response validators", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts Workers Builds trigger lists", () => {
    const validate =
      cloudflareApiResponseValidators.GET[
        "/accounts/{account_id}/builds/workers/{external_script_id}/triggers"
      ];

    expect(
      validate({
        success: true,
        errors: [],
        messages: [],
        result: [],
      }),
    ).toBe(true);
  });

  it("accepts observed Workers Builds metadata", () => {
    const validate =
      cloudflareApiResponseValidators.GET[
        "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
      ];

    expect(
      validate({
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            build_trigger_metadata: {
              build_trigger_source: "push_event",
              environment_variables: {
                SECRET_TOKEN: {
                  created_on: "2026-07-22T00:00:00Z",
                  is_secret: true,
                  value: null,
                },
                PUBLIC_VALUE: {
                  created_on: "2026-07-22T00:00:00Z",
                  is_secret: false,
                  value: "production",
                },
              },
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts an observed completed Worker build", () => {
    const validate =
      cloudflareApiResponseValidators.GET[
        "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
      ];

    // Captured from this endpoint on 2026-08-03. Fields unrelated to build
    // matching, including environment variables, are omitted.
    expect(
      validate({
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            build_uuid: "f9e12f48-dd63-4e28-aef7-ece63d11539d",
            status: "stopped",
            build_outcome: "success",
            initializing_on: "2026-08-02T21:45:39.750Z",
            running_on: "2026-08-02T21:45:41.791Z",
            stopped_on: "2026-08-02T21:47:46.612Z",
            created_on: "2026-08-02T21:45:39.403Z",
            modified_on: "2026-08-02T21:47:46.612Z",
            build_trigger_metadata: {
              branch: "main",
              build_trigger_source: "push_event",
              commit_hash: "6d09686de7d285f174770eb3f0c8a5ff60f17376",
              deploy_command: "pnpm run deploy",
              root_directory: "apps/samebase",
            },
            trigger: {
              deploy_command: "pnpm run deploy",
              external_script_id: "470db9109dce4196af330cdd7be89518",
              repo_connection: { repo_id: "1021726325" },
              root_directory: "apps/samebase",
              trigger_uuid: "b595a215-7b9b-4a04-a55d-578f39ca4335",
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts successful Worker version lists with null message fields", () => {
    const validate =
      cloudflareApiResponseValidators.GET[
        "/accounts/{account_id}/workers/workers/{worker_id}/versions"
      ];

    expect(
      validate({
        success: true,
        errors: null,
        messages: null,
        result: [
          {
            created_on: "2026-07-22T00:00:00Z",
            id: "version-id",
            number: 17,
            urls: ["https://a1b2c3d4-samebase.example.workers.dev"],
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts Worker detail domain references without certificate ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            messages: [],
            result: {
              created_on: "2026-06-22T00:00:00Z",
              id: "worker-tag",
              logpush: false,
              name: "samebase",
              observability: {
                enabled: false,
                head_sampling_rate: 1,
              },
              references: {
                dispatch_namespace_outbounds: [],
                domains: [
                  {
                    hostname: "samebase.com",
                    id: "domain-id",
                    zone_id: "zone-id",
                    zone_name: "samebase.com",
                  },
                ],
                durable_objects: [],
                queues: [],
                workers: [],
              },
              subdomain: {
                enabled: false,
              },
              tags: [],
              tail_consumers: [],
              updated_on: "2026-06-22T00:00:00Z",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const worker = await requestCloudflareApi({
      token: "cloudflare-token",
      transport: "direct",
      method: "GET",
      path: "/accounts/{account_id}/workers/workers/{worker_id}",
      params: {
        path: {
          account_id: "account-id",
          worker_id: "samebase",
        },
      },
    });

    expect(worker).toMatchObject({
      references: {
        domains: [
          {
            hostname: "samebase.com",
            id: "domain-id",
            zone_id: "zone-id",
            zone_name: "samebase.com",
          },
        ],
      },
    });
    expect(JSON.stringify(worker)).not.toContain("certificate_id");
  });
});
