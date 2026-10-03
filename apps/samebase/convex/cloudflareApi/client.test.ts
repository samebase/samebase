import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { safeParse } from "valibot";

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
import {
  observedPreviewWorkerBuildSettings,
  observedWorkerRuntimePreview,
} from "./fixtures/observedWorkerPreviews";
import { Cloudflare } from "./generated/sdk.gen";
import {
  vGetAccountsByAccountIdBuildsWorkersByExternalScriptIdTriggersResponse,
  vGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse,
  vGetAccountsByAccountIdWorkersWorkersByWorkerIdPreviewsByPreviewIdResponse,
} from "./generated/valibot.gen";

describe("Cloudflare API transport", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects a missing required request field before fetch even when the schema has a default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(error).toHaveBeenCalledTimes(1);
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_request_validation_failed");
    expect(log).toContain('"type":"object"');
    expect(log).toContain("logpush");
    expect(log).not.toContain("samebase-app");
    expect(log).not.toContain("cloudflare-token");
  });

  it.each([
    { authMethod: "oauth", transport: "direct" },
    { authMethod: "api_key", transport: "direct" },
    { authMethod: "mcp_oauth", transport: "mcp" },
  ] as const)("uses $transport for $authMethod", ({ authMethod, transport }) => {
    expect(resolveCloudflareApiTransport(authMethod)).toBe(transport);
  });

  it.each([
    { name: "set", value: { is_secret: true, value: "private-request-value" }, valid: true },
    { name: "delete", value: null, valid: true },
    { name: "invalid fields", value: { is_secret: "wrong", value: 12 }, valid: false },
    { name: "array", value: [], valid: false },
  ])("validates a build environment variable update: $name", async ({ value, valid }) => {
    const envelope = {
      success: true,
      errors: [],
      messages: [],
      result: observedPreviewWorkerBuildSettings,
    };
    const fetch = vi.fn(async (_request: Request) => Response.json(envelope));
    vi.stubGlobal("fetch", fetch);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = Cloudflare.PATCH["/accounts/{account_id}/builds/workers/{script_tag}"]({
      client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      path: { account_id: "account-id", script_tag: "worker-id" },
      body: {
        production_settings: {
          // @ts-expect-error Invalid values deliberately exercise the runtime request boundary.
          environment_variables: { PRIVATE_ENVIRONMENT_VARIABLE_NAME: value },
        },
      },
    });
    if (valid) {
      await expect(response).resolves.toEqual(envelope);
      expect(await fetch.mock.calls[0]?.[0].json()).toEqual({
        production_settings: {
          environment_variables: { PRIVATE_ENVIRONMENT_VARIABLE_NAME: value },
        },
      });
    } else {
      await expect(response).rejects.toThrow("Cloudflare API request is invalid");
      expect(fetch).not.toHaveBeenCalled();
      const log = String(error.mock.calls[0]?.[0]);
      expect(log).not.toContain("PRIVATE_ENVIRONMENT_VARIABLE_NAME");
      expect(log).not.toContain("private-request-value");
    }
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
      status: 400,
    },
    {
      name: "invalid name with HTTP 200",
      response: observedInvalidWorkerNameResponse,
      workerName: "samebase-app",
      status: 200,
    },
    {
      name: "preview name limit",
      response: observedPreviewWorkerNameTooLongResponse,
      workerName: "samebase-preview",
      status: 400,
    },
  ])("parses the observed Worker $name error", async ({ response, workerName, status }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify(response), {
          status,
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
    const parse = vi.spyOn(JSON, "parse");
    await expect(
      Cloudflare.GET["/accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}"](
        options,
      ),
    ).resolves.toEqual(envelope);
    expect(parse.mock.calls.filter(([text]) => text === JSON.stringify(envelope))).toHaveLength(1);
    parse.mockRestore();

    const { logpush: _logpush, ...missingLogpush } = observedWorkerRuntimePreview;
    fetch.mockImplementation(async () => Response.json({ ...envelope, result: missingLogpush }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      Cloudflare.GET["/accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}"](
        options,
      ),
    ).rejects.toBeInstanceOf(CloudflareApiResponseError);
  });

  it.each([
    { name: "result", result: [] },
    {
      name: "nested settings",
      result: { ...observedPreviewWorkerBuildSettings, production_settings: [] },
    },
  ])("rejects an array in the $name object", async ({ result }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: true, errors: [], messages: [], result })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      Cloudflare.GET["/accounts/{account_id}/builds/workers/{script_tag}"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
        path: { account_id: "account-id", script_tag: "worker-id" },
      }),
    ).rejects.toBeInstanceOf(CloudflareApiResponseError);
  });

  it("rejects a JSON number that overflows to Infinity", async () => {
    const envelope = {
      success: true,
      errors: [],
      messages: [],
      result: observedWorkerRuntimePreview,
    };
    const body = JSON.stringify(envelope).replace(
      /"head_sampling_rate":1/g,
      '"head_sampling_rate":1e400',
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { headers: { "Content-Type": "application/json" } })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      Cloudflare.GET["/accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
        path: {
          account_id: "account-id",
          worker_id: "worker-id",
          preview_id: observedWorkerRuntimePreview.id,
        },
      }),
    ).rejects.toBeInstanceOf(CloudflareApiResponseError);
  });

  it.each([
    { name: "array", entry: [] },
    { name: "null", entry: null },
    { name: "string", entry: "invalid" },
    { name: "invalid ID", entry: { id: 42 } },
    { name: "invalid export", entry: { exports: { default: { type: "invalid" } } } },
  ])("rejects $name in Worker script inventory", async ({ entry }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, errors: [], messages: [], result: [entry] }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      Cloudflare.GET["/accounts/{account_id}/workers/scripts"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
        path: { account_id: "account-id" },
      }),
    ).rejects.toBeInstanceOf(CloudflareApiResponseError);
  });

  it.each([
    {
      name: "non-JSON",
      body: "private malformed provider response",
      status: 200,
      reason: "invalid_json",
    },
    {
      name: "non-JSON HTTP error",
      body: "private malformed provider response",
      status: 502,
      reason: "invalid_json",
    },
    { name: "empty", body: "", status: 200, reason: "invalid_json" },
    { name: "no-content", body: null, status: 204, reason: "invalid_json" },
    { name: "null", body: "null", status: 200, reason: "non_object_response" },
    { name: "null HTTP error", body: "null", status: 400, reason: "non_object_response" },
    {
      name: "string",
      body: '"private malformed provider response"',
      status: 200,
      reason: "non_object_response",
    },
  ])("returns and logs a $name response without its contents", async ({ body, status, reason }) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status })),
    );

    await expect(
      Cloudflare.GET["/accounts"]({
        client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      }),
    ).rejects.toMatchObject({ failure: reason });
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_parse_failed");
    expect(log).toContain(`"reason":"${reason}"`);
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
      throw new Error("Expected Valibot validation issues.");
    const issues = failure.failure;
    expect(issues.length).toBeGreaterThan(1);
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_ENVIRONMENT_VARIABLE_NAME");
    expect(
      issues.some((issue) =>
        issue.path?.some((item) => item.key === "PRIVATE_ENVIRONMENT_VARIABLE_NAME"),
      ),
    ).toBe(true);
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_validation_failed");
    expect(log).toContain('"provider":"cloudflare"');
    expect(log).toContain('"type":"boolean"');
    expect(log).toContain('"expected":"boolean"');
    expect(log).not.toContain("PRIVATE_ENVIRONMENT_VARIABLE_NAME");
    expect(log).not.toContain("private-provider-value");
    expect(log).not.toContain("private-account-id");
    expect(log).not.toContain("private-worker-id");
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("accepts Workers Builds trigger lists", () => {
    const schema = vGetAccountsByAccountIdBuildsWorkersByExternalScriptIdTriggersResponse;

    expect(
      safeParse(schema, {
        success: true,
        errors: [],
        messages: [],
        result: [],
      }).success,
    ).toBe(true);
  });

  it("accepts observed Workers Builds metadata", () => {
    const schema = vGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse;

    expect(
      safeParse(schema, {
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

  it.each([
    { createdOn: observedCompletedWorkerBuild.created_on, valid: true },
    { createdOn: "2026-08-02T21:45:39.403+00:00", valid: true },
    { createdOn: "2026-08-03T00:45:39.403+03:00", valid: true },
    { createdOn: "2026-08-02T21:45:39.403", valid: false },
    { createdOn: "2026-08-02T21:45:39.403+25:00", valid: false },
    { createdOn: "2026-02-31T21:45:39.403Z", valid: false },
    { createdOn: "2026-08-02 21:45:39.403Z", valid: false },
    { createdOn: "2026-08-02T21:45:39.403+0000", valid: false },
  ])("validates Worker build timestamp $createdOn", async ({ createdOn, valid }) => {
    // The first three forms express the captured instant under RFC3339.
    // https://www.rfc-editor.org/rfc/rfc3339#section-5.6
    const envelope = {
      success: true,
      errors: [],
      messages: [],
      result: [{ ...observedCompletedWorkerBuild, created_on: createdOn }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(envelope)),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = Cloudflare.GET[
      "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
    ]({
      client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      path: { account_id: "account-id", external_script_id: "worker-id" },
    });

    if (valid) {
      expect(Date.parse(createdOn)).toBe(Date.parse(observedCompletedWorkerBuild.created_on));
      await expect(response).resolves.toEqual(envelope);
    } else {
      await expect(response).rejects.toBeInstanceOf(CloudflareApiResponseError);
    }
  });

  it("accepts an observed running Worker build", () => {
    const schema = vGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse;

    const response = {
      success: true,
      errors: [],
      messages: [],
      result: [observedRunningWorkerBuild],
    };
    expect(
      safeParse(schema, response).success,
      "Expected response schema to accept the payload",
    ).toBe(true);
  });

  it.each([
    { totalCount: Number.MAX_SAFE_INTEGER, valid: true },
    { totalCount: Number.MAX_SAFE_INTEGER + 1, valid: false },
    { totalCount: 1.5, valid: false },
  ])("validates Worker build count $totalCount", async ({ totalCount, valid }) => {
    const envelope = {
      success: true,
      errors: [],
      messages: [],
      result: [observedCompletedWorkerBuild],
      result_info: { total_count: totalCount },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(envelope)),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = Cloudflare.GET[
      "/accounts/{account_id}/builds/workers/{external_script_id}/builds"
    ]({
      client: createCloudflareClient({ token: "cloudflare-token", transport: "direct" }),
      path: { account_id: "account-id", external_script_id: "worker-id" },
    });
    if (valid) await expect(response).resolves.toEqual(envelope);
    else await expect(response).rejects.toBeInstanceOf(CloudflareApiResponseError);
  });

  it("accepts an observed retried Worker build", () => {
    const schema = vGetAccountsByAccountIdBuildsWorkersByExternalScriptIdBuildsResponse;

    expect(
      safeParse(schema, {
        success: true,
        errors: [],
        messages: [],
        result: [observedRetriedWorkerBuildMetadata],
      }).success,
      "Expected response schema to accept the payload",
    ).toBe(true);
  });

  it("accepts an observed Worker preview with null message fields", () => {
    const schema = vGetAccountsByAccountIdWorkersWorkersByWorkerIdPreviewsByPreviewIdResponse;

    expect(
      safeParse(schema, {
        success: true,
        errors: null,
        messages: null,
        result: observedWorkerRuntimePreview,
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
