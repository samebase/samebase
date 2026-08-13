import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { buildCloudflareWorkerCreateBody } from "../cloudflareResources";
import {
  requestCloudflareApi,
  requestCloudflareApiOrThrow,
  resolveCloudflareApiTransport,
} from "./client";
import {
  observedCompletedWorkerBuild,
  observedRetriedWorkerBuildMetadata,
  observedRunningWorkerBuild,
} from "./fixtures/observedWorkerBuilds";
import {
  observedInvalidWorkerNameResponse,
  observedPreviewWorkerNameTooLongResponse,
} from "./fixtures/observedWorkerErrors";
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
      requestCloudflareApiOrThrow({
        token: "cloudflare-token",
        transport: "direct",
        method: "GET",
        path: "/accounts",
      }),
    ).rejects.toThrow("Cloudflare API request timed out after 30000ms.");

    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it.each([
    {
      name: "invalid name",
      response: observedInvalidWorkerNameResponse,
      workerName: "samebase app",
    },
    {
      name: "preview name limit",
      response: observedPreviewWorkerNameTooLongResponse,
      workerName: "a".repeat(55),
    },
  ])("parses the observed Worker $name error", async ({ response, workerName }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify(response), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(
      requestCloudflareApiOrThrow({
        token: "cloudflare-token",
        transport: "direct",
        method: "POST",
        path: "/accounts/{account_id}/workers/workers",
        params: { path: { account_id: "account-id" } },
        body: buildCloudflareWorkerCreateBody(workerName),
      }),
    ).rejects.toMatchObject({
      name: "CloudflareApiError",
      method: "POST",
      details: [
        {
          code: String(response.errors[0].code),
          message: response.errors[0].message,
        },
      ],
    });
  });
});

describe("Cloudflare API response validators", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns and logs a non-JSON response without its contents", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private malformed provider response", { status: 200 })),
    );

    const [valid, failure] = await requestCloudflareApi({
      token: "cloudflare-token",
      transport: "direct",
      method: "GET",
      path: "/accounts",
    });

    expect(valid).toBe(false);
    if (valid) {
      throw new Error("Expected Cloudflare response parsing to fail.");
    }
    expect(failure).toBe("invalid_json");
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_parse_failed");
    expect(log).toContain('"reason":"invalid_json"');
    expect(log).not.toContain("private malformed provider response");
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("returns every validation issue and logs only schema details", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return Response.json({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              ...observedCompletedWorkerBuild,
              build_trigger_metadata: {
                ...observedCompletedWorkerBuild.build_trigger_metadata,
                build_trigger_source: "unexpected-trigger-value",
                environment_variables: {
                  PRIVATE_ENVIRONMENT_VARIABLE_NAME: {
                    created_on: 42,
                    is_secret: "not-a-boolean",
                    value: "private-provider-value",
                  },
                },
              },
            },
          ],
        });
      }),
    );

    const [valid, issues] = await requestCloudflareApi({
      token: "cloudflare-token",
      transport: "direct",
      method: "GET",
      path: "/accounts/{account_id}/builds/workers/{external_script_id}/builds",
      params: {
        path: {
          account_id: "private-account-id",
          external_script_id: "private-worker-id",
        },
      },
    });

    expect(valid).toBe(false);
    if (valid) {
      throw new Error("Expected Cloudflare response validation to fail.");
    }
    if (!Array.isArray(issues)) {
      throw new Error("Expected AJV validation issues.");
    }
    expect(issues.length).toBeGreaterThan(1);
    expect(issues.some((issue) => issue.instancePath.includes("PRIVATE_ENVIRONMENT"))).toBe(true);
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_validation_failed");
    expect(log).toContain('"provider":"cloudflare"');
    expect(log).toContain('"schema_path"');
    expect(log).not.toContain("PRIVATE_ENVIRONMENT_VARIABLE_NAME");
    expect(log).not.toContain("private-provider-value");
    expect(log).not.toContain("private-account-id");
    expect(log).not.toContain("private-worker-id");
    expect(error).toHaveBeenCalledTimes(1);
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

    expect(
      validate({
        success: true,
        errors: [],
        messages: [],
        result: [observedCompletedWorkerBuild],
      }),
    ).toBe(true);
  });

  it("accepts an observed running Worker build", () => {
    const validate =
      cloudflareApiResponseValidators.GET[
        "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
      ];

    const response = {
      success: true,
      errors: [],
      messages: [],
      result: [observedRunningWorkerBuild],
    };
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts an observed retried Worker build", () => {
    const validate =
      cloudflareApiResponseValidators.GET[
        "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
      ];

    expect(
      validate({
        success: true,
        errors: [],
        messages: [],
        result: [observedRetriedWorkerBuildMetadata],
      }),
      JSON.stringify(validate.errors),
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

    const worker = await requestCloudflareApiOrThrow({
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
