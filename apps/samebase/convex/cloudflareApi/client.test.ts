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
