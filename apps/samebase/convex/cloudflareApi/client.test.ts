import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { requestCloudflareApi } from "./client";
import { cloudflareApiResponseValidators } from "./validators.generated";

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
