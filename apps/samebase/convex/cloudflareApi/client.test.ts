import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { buildCloudflareWorkerCreateBody } from "../cloudflareResources";
import {
  createCloudflareClient,
  CloudflareApiResponseError,
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
import { observedWorkerRuntimePreview } from "./fixtures/observedWorkerPreviews";
import { Cloudflare } from "./generated/sdk.gen";
import {
  zGetAccountsByAccountIdBuildsWorkersByExternalScriptIdTriggersResponse,
  zGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse,
  zGetAccountsByAccountIdWorkersWorkersByWorkerIdVersionsResponse,
} from "./generated/zod.gen";

describe("Cloudflare API transport", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects a missing required request field before fetch even when the schema has a default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { logpush: _logpush, ...body } = buildCloudflareWorkerCreateBody("samebase-app");
    await expect(
      Cloudflare.POST["/accounts/{account_id}/workers/workers"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
        path: { account_id: "account-id" },
        // @ts-expect-error Deliberately omit a required field to test the runtime boundary.
        body,
      }),
    ).rejects.toThrow("Cloudflare API request is invalid");
    expect(fetch).not.toHaveBeenCalled();
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
      Cloudflare.GET["/accounts"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      }).then((response) => response.result),
    ).rejects.toThrow("Cloudflare API request timed out after 30000ms.");

    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it.each([
    {
      name: "invalid name",
      response: observedInvalidWorkerNameResponse,
      workerName: "samebase-app",
    },
    {
      name: "preview name limit",
      response: observedPreviewWorkerNameTooLongResponse,
      workerName: "samebase-preview",
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
      Cloudflare.POST["/accounts/{account_id}/workers/workers"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
        path: { account_id: "account-id" },
        body: buildCloudflareWorkerCreateBody(workerName),
      }).then((response) => response.result),
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

  it("preserves the received preview and rejects a missing required defaulted field", async () => {
    const envelope = {
      success: true,
      errors: [],
      messages: [],
      result: observedWorkerRuntimePreview,
    };
    const fetch = vi.fn(async () => Response.json(envelope));
    vi.stubGlobal("fetch", fetch);
    const options = {
      client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      path: {
        account_id: "account-id",
        worker_id: "worker-id",
        preview_id: observedWorkerRuntimePreview.id,
      },
    };
    await expect(
      Cloudflare.GET["/accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}"](
        options,
      ),
    ).resolves.toEqual(envelope);

    const { logpush: _logpush, ...missingLogpush } = observedWorkerRuntimePreview;
    fetch.mockImplementation(async () => Response.json({ ...envelope, result: missingLogpush }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      Cloudflare.GET["/accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}"](
        options,
      ),
    ).rejects.toBeInstanceOf(CloudflareApiResponseError);
  });

  it("accepts the published secrets response without write-only secret text", async () => {
    // Published 200 response, retrieved 2026-10-03:
    // https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/list/
    const envelope = {
      errors: [
        {
          code: 1000,
          message: "message",
          documentation_url: "documentation_url",
          source: { pointer: "pointer" },
        },
      ],
      messages: [
        {
          code: 1000,
          message: "message",
          documentation_url: "documentation_url",
          source: { pointer: "pointer" },
        },
      ],
      success: true,
      result: [{ name: "myBinding", type: "secret_text" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(envelope)),
    );
    await expect(
      Cloudflare.GET["/accounts/{account_id}/workers/scripts/{script_name}/secrets"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
        path: { account_id: "account-id", script_name: "samebase-app" },
      }),
    ).resolves.toEqual(envelope);
  });

  it("returns and logs a non-JSON response without its contents", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private malformed provider response", { status: 200 })),
    );

    await expect(
      Cloudflare.GET["/accounts"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      }),
    ).rejects.toMatchObject({ failure: "invalid_json" });
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

    const failure = await Cloudflare.GET[
      "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
    ]({
      client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      path: {
        account_id: "private-account-id",
        external_script_id: "private-worker-id",
      },
    }).catch((error: unknown) => error);

    if (!(failure instanceof CloudflareApiResponseError) || typeof failure.failure === "string")
      throw new Error("Expected Zod validation issues.");
    const issues = failure.failure;
    expect(issues.length).toBeGreaterThan(1);
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_ENVIRONMENT_VARIABLE_NAME");
    expect(issues.some((issue) => issue.path.includes("PRIVATE_ENVIRONMENT_VARIABLE_NAME"))).toBe(
      true,
    );
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_validation_failed");
    expect(log).toContain('"provider":"cloudflare"');
    expect(log).toContain('"code"');
    expect(log).not.toContain("PRIVATE_ENVIRONMENT_VARIABLE_NAME");
    expect(log).not.toContain("private-provider-value");
    expect(log).not.toContain("private-account-id");
    expect(log).not.toContain("private-worker-id");
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("accepts Workers Builds trigger lists", () => {
    const schema = zGetAccountsByAccountIdBuildsWorkersByExternalScriptIdTriggersResponse;

    expect(
      schema.safeParse({
        success: true,
        errors: [],
        messages: [],
        result: [],
      }).success,
    ).toBe(true);
  });

  it("accepts observed Workers Builds metadata", () => {
    const schema = zGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse;

    expect(
      schema.safeParse({
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
      }).success,
    ).toBe(true);
  });

  it("accepts an observed completed Worker build", () => {
    const schema = zGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse;

    expect(
      schema.safeParse({
        success: true,
        errors: [],
        messages: [],
        result: [observedCompletedWorkerBuild],
      }).success,
    ).toBe(true);
  });

  it("accepts an observed running Worker build", () => {
    const schema = zGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse;

    const response = {
      success: true,
      errors: [],
      messages: [],
      result: [observedRunningWorkerBuild],
    };
    expect(
      schema.safeParse(response).success,
      "Expected response schema to accept the payload",
    ).toBe(true);
  });

  it("accepts an observed retried Worker build", () => {
    const schema = zGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse;

    expect(
      schema.safeParse({
        success: true,
        errors: [],
        messages: [],
        result: [observedRetriedWorkerBuildMetadata],
      }).success,
      "Expected response schema to accept the payload",
    ).toBe(true);
  });

  it("accepts successful Worker version lists with null message fields", () => {
    const schema = zGetAccountsByAccountIdWorkersWorkersByWorkerIdVersionsResponse;

    expect(
      schema.safeParse({
        success: true,
        errors: null,
        messages: null,
        result: [
          {
            created_on: "2026-07-22T00:00:00Z",
            id: "f9e12f48-dd63-4e28-aef7-ece63d11539d",
            number: 17,
            urls: ["https://a1b2c3d4-samebase.example.workers.dev"],
          },
        ],
      }).success,
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

    const worker = await Cloudflare.GET["/accounts/{account_id}/workers/workers/{worker_id}"]({
      client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      path: {
        account_id: "account-id",
        worker_id: "samebase",
      },
    }).then((response) => response.result);

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
