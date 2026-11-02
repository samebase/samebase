import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("./cloudflareMcp", () => ({
  callCloudflareMcpTool: callCloudflareMcpToolMock,
}));

import {
  CloudflareApiError,
  classifyCloudflareWorkerRepositoryDiscovery,
  isCloudflareMcpInvalidAccessTokenError,
  isCloudflareWorkerNotFoundError,
  isWorkersBuildsInvalidTokenMessage,
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerBranchPreviewUrls,
  readRecentCloudflareWorkerBuilds,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentityByTag,
  readCloudflareWorkerTag,
} from "./cloudflareResources";
import {
  normalizeCloudflareAccounts,
  resolveCloudflareAccountAfterAuthorization,
} from "./cloudflareAccountDiscovery";
import {
  observedLegacyWorkerBuildSettings,
  observedMissingWorkerBuildSettingsResponse,
  observedNativeWorkerBuildSettings,
} from "./cloudflareApi/fixtures/observedWorkerBuildSettings";
import {
  observedPreviewWorkerBuildSettings,
  observedWorkerPreviewSummaries,
  observedWorkerRuntimePreview,
} from "./cloudflareApi/fixtures/observedWorkerPreviews";
import type { BuildsWorkerResponse } from "./cloudflareApi/generated/types.gen";

const cloudflareWorkerReadEnvelope = JSON.stringify({
  success: true,
  errors: [],
  messages: [],
  result: {
    created_on: "2026-06-22T00:00:00Z",
    id: "worker-tag",
    logpush: false,
    name: "samebase-app",
    observability: {
      enabled: false,
      head_sampling_rate: 1,
    },
    references: {
      dispatch_namespace_outbounds: [],
      domains: [
        {
          hostname: "www.example.com",
          id: "domain-www",
          zone_id: "zone-id",
          zone_name: "example.com",
        },
        {
          hostname: " app.example.com ",
          id: "domain-app",
          zone_id: "zone-id",
          zone_name: "example.com",
        },
        {
          hostname: "app.example.com",
          id: "domain-app-duplicate",
          zone_id: "zone-id",
          zone_name: "example.com",
        },
      ],
      durable_objects: [],
      queues: [],
      workers: [],
    },
    subdomain: {
      enabled: true,
      previews_enabled: true,
      url: "https://samebase-app.provider-owned.workers.dev",
    },
    tags: [],
    tail_consumers: [],
    updated_on: "2026-06-22T00:00:00Z",
  },
});

function stubCloudflareWorkerRead(envelope = cloudflareWorkerReadEnvelope) {
  const fetchMock = vi.fn(
    async () =>
      new Response(envelope, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type WorkerBuildSettings = BuildsWorkerResponse;
const observedRepository = observedNativeWorkerBuildSettings.git_repository;
const workerTag = observedNativeWorkerBuildSettings.script_tag;
const accountId = "account-id";
const settingsPath = `/client/v4/accounts/${accountId}/builds/workers/${workerTag}`;

function cloudflareSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildDiscoveryArgs() {
  return {
    token: "oauth-token",
    transport: "direct" as const,
    accountId,
    workerTag,
    expectedRepoId: observedRepository.repo_id,
    defaultBranch: "main",
  };
}

function stubNativeBuilds(args: { settings: WorkerBuildSettings | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      const path = new URL(url).pathname;
      if (path === settingsPath && method === "GET") {
        if (!args.settings)
          return new Response(JSON.stringify(observedMissingWorkerBuildSettingsResponse), {
            status: 404,
          });
        return cloudflareSuccessResponse(args.settings);
      }
      throw new Error(`Unexpected Cloudflare request ${method} ${path}`);
    }),
  );
}

afterEach(() => {
  callCloudflareMcpToolMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cloudflare resources", () => {
  it("does not read a trigger not-found error as a Worker not-found error", () => {
    const triggerError = new CloudflareApiError({
      method: "GET",
      path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables",
      details: [{ code: "10007", message: "trigger not found" }],
    });
    const workerError = new CloudflareApiError({
      method: "GET",
      path: "/accounts/{account_id}/builds/workers/{external_script_id}/triggers",
      details: [{ code: "10007", message: "Worker not found" }],
    });

    expect(isCloudflareWorkerNotFoundError(triggerError)).toBe(false);
    expect(isCloudflareWorkerNotFoundError(workerError)).toBe(true);
  });

  it("reads the production URL and normalized custom domains from the Worker identity response", async () => {
    const fetchMock = stubCloudflareWorkerRead();

    await expect(
      readCloudflareWorkerIdentityByTag({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerTag: "worker-tag",
      }),
    ).resolves.toEqual({
      customDomains: ["app.example.com", "www.example.com"],
      workersDev: {
        state: "enabled",
        url: "https://samebase-app.provider-owned.workers.dev",
      },
      workerName: "samebase-app",
      workerTag: "worker-tag",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a renamed Worker by its immutable tag and returns its current name", async () => {
    const requestedPaths: string[] = [];
    const renamedEnvelope = cloudflareWorkerReadEnvelope
      .replace('"name":"samebase-app"', '"name":"renamed-app"')
      .replace("samebase-app.provider-owned.workers.dev", "renamed-app.provider-owned.workers.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedPaths.push(new URL(input instanceof Request ? input.url : String(input)).pathname);
        return new Response(renamedEnvelope, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(
      readCloudflareWorkerIdentityByTag({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerTag: "worker-tag",
      }),
    ).resolves.toMatchObject({ workerName: "renamed-app", workerTag: "worker-tag" });
    expect(requestedPaths).toEqual(["/client/v4/accounts/account-id/workers/workers/worker-tag"]);
  });

  it("does not expose the production URL when workers.dev is disabled", async () => {
    const disabledEnvelope = cloudflareWorkerReadEnvelope.replace(
      '"subdomain":{"enabled":true',
      '"subdomain":{"enabled":false',
    );
    stubCloudflareWorkerRead(disabledEnvelope);

    await expect(
      readCloudflareWorkerIdentityByTag({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerTag: "worker-tag",
      }),
    ).resolves.toMatchObject({ workersDev: { state: "disabled" } });
  });

  it("marks an enabled Worker without a production URL as invalid", async () => {
    const missingUrlEnvelope = cloudflareWorkerReadEnvelope.replace(
      ',"url":"https://samebase-app.provider-owned.workers.dev"',
      "",
    );
    stubCloudflareWorkerRead(missingUrlEnvelope);

    await expect(
      readCloudflareWorkerIdentityByTag({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerTag: "worker-tag",
      }),
    ).resolves.toMatchObject({
      workersDev: { state: "failed", reason: "response_validation_failed" },
    });
  });

  it("reads a second Workers Builds page before declaring the history exhausted", async () => {
    const requestedPages: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const page = url.searchParams.get("page") ?? "";
        requestedPages.push(page);
        const result = Array.from({ length: page === "1" ? 100 : 1 }, (_, index) => ({
          build_uuid: `f9e12f48-dd63-4e28-aef7-${`${page}${index}`.padStart(12, "0")}`,
        }));
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            messages: [],
            result,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const [valid, read] = await readRecentCloudflareWorkerBuilds({
      token: "oauth-token",
      transport: "direct",
      accountId: "account-id",
      workerTag: "worker-tag",
    });

    expect(valid).toBe(true);
    if (!valid) {
      throw new Error("Expected the Workers Builds history response to pass validation.");
    }
    expect(requestedPages).toEqual(["1", "2"]);
    expect(read.builds).toHaveLength(101);
    expect(read.exhausted).toBe(true);
  });

  it("uses the Workers service id as the Workers Builds tag", () => {
    expect(
      readCloudflareWorkerTag(
        {
          id: "775e3115b5f8411988e4a6b1411d0022",
          name: "samebase-app",
        },
        "samebase-app",
      ),
    ).toBe("775e3115b5f8411988e4a6b1411d0022");
  });

  it("uses alternate Worker tag fields when the service id is missing", () => {
    expect(
      readCloudflareWorkerTag(
        {
          external_script_id: "worker-external-script-id",
          tag: "worker-tag",
          name: "samebase-app",
        },
        "samebase-app",
      ),
    ).toBe("worker-external-script-id");
    expect(
      readCloudflareWorkerTag(
        {
          tag: "worker-tag",
          name: "samebase-app",
        },
        "samebase-app",
      ),
    ).toBe("worker-tag");
  });

  it("recognizes Workers Builds invalid token failures from MCP errors", () => {
    expect(
      isWorkersBuildsInvalidTokenMessage({
        path: "/accounts/account-id/builds/repos/connections",
        message:
          "Cloudflare MCP tool call failed: Error: Cloudflare API error: 12006: Invalid token",
      }),
    ).toBe(true);
  });

  it("recognizes invalid Cloudflare MCP access tokens", () => {
    expect(
      isCloudflareMcpInvalidAccessTokenError(
        new Error(
          'Cloudflare MCP request failed (401): {"error":"invalid_token","error_description":"Invalid access token"}',
        ),
      ),
    ).toBe(true);
  });

  it("selects the only Cloudflare account exposed to OAuth", () => {
    expect(
      resolveCloudflareAccountAfterAuthorization(
        normalizeCloudflareAccounts([{ id: " account-id ", name: " Account " }]),
        undefined,
      ),
    ).toEqual({
      accountId: "account-id",
      accountName: "Account",
    });
  });

  it("fails closed unless Cloudflare OAuth exposes exactly one account", () => {
    const accounts = normalizeCloudflareAccounts([
      { id: "first-account-id", name: "First account" },
      { id: "second-account-id", name: "Second account" },
    ]);

    expect(resolveCloudflareAccountAfterAuthorization([], undefined)).toBeNull();
    expect(resolveCloudflareAccountAfterAuthorization(accounts, undefined)).toBeNull();
    expect(
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "first-account-id",
        accountName: "First account",
      }),
    ).toBeNull();
  });

  it("rejects a Cloudflare account without a name", () => {
    expect(() => normalizeCloudflareAccounts([{ id: "account-id", name: " " }])).toThrow(
      "Cloudflare account response included an account without a name.",
    );
  });

  it("keeps the connected account only when a replacement grant can access it", () => {
    const accounts = normalizeCloudflareAccounts([{ id: "account-a", name: "Account A renamed" }]);

    expect(
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "account-a",
        accountName: "Account A",
      }),
    ).toEqual({
      accountId: "account-a",
      accountName: "Account A renamed",
    });
    expect(
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "account-missing",
        accountName: "Missing account",
      }),
    ).toBeNull();
  });
});

describe("native Worker Preview URLs", () => {
  const previewArgs = {
    token: "test-token",
    transport: "direct" as const,
    accountId,
    workerTag: observedPreviewWorkerBuildSettings.script_tag,
    workerName: observedPreviewWorkerBuildSettings.git_repository.repo_name,
    expectedRepoId: observedPreviewWorkerBuildSettings.git_repository.repo_id,
    defaultBranch: observedPreviewWorkerBuildSettings.git_repository.branch,
    rootDirectory: observedPreviewWorkerBuildSettings.production_settings.root_directory,
    branches: [observedWorkerPreviewSummaries[0].branch],
  };

  function stubPreviewReads(results: readonly unknown[]) {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const result = results[requests.length];
        requests.push(input instanceof Request ? input.url : String(input));
        if (result === undefined) throw new Error("Unexpected Preview read.");
        return cloudflareSuccessResponse(result);
      }),
    );
    return requests;
  }

  it("reads the current branch Preview ID and its runtime URL under the attached Worker", async () => {
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      observedWorkerPreviewSummaries,
      observedWorkerRuntimePreview,
    ]);
    expect(await readCloudflareWorkerBranchPreviewUrls(previewArgs)).toEqual(
      new Map([[observedWorkerPreviewSummaries[0].branch, observedWorkerRuntimePreview.urls[0]]]),
    );
    expect(requests.map((url) => new URL(url).pathname)).toEqual([
      `/client/v4/accounts/${accountId}/builds/workers/${previewArgs.workerTag}`,
      `/client/v4/accounts/${accountId}/builds/workers/${previewArgs.workerTag}/previews`,
      `/client/v4/accounts/${accountId}/workers/workers/${previewArgs.workerTag}/previews/${observedWorkerRuntimePreview.id}`,
    ]);
  });

  it("does not read a runtime URL when there is no exact branch match", async () => {
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      observedWorkerPreviewSummaries,
    ]);
    expect(
      await readCloudflareWorkerBranchPreviewUrls({ ...previewArgs, branches: ["other-branch"] }),
    ).toEqual(new Map());
    expect(requests).toHaveLength(2);
  });

  it.each([
    { expectedRepoId: "another-repository" },
    { rootDirectory: "apps/another-app" },
    { defaultBranch: "another-production-branch" },
  ])(
    "rejects a changed repository, root, or production branch before reading Previews (%j)",
    async (changed) => {
      const requests = stubPreviewReads([observedPreviewWorkerBuildSettings]);
      await expect(
        readCloudflareWorkerBranchPreviewUrls({ ...previewArgs, ...changed }),
      ).rejects.toThrow("no longer match");
      expect(requests).toHaveLength(1);
    },
  );

  it("does not choose between two Preview IDs for the same branch", async () => {
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      [
        ...observedWorkerPreviewSummaries,
        { ...observedWorkerPreviewSummaries[0], preview_id: "f".repeat(32) },
      ],
    ]);
    expect(await readCloudflareWorkerBranchPreviewUrls(previewArgs)).toEqual(new Map());
    expect(requests).toHaveLength(2);
  });

  it.each([
    {
      previews: Array.from({ length: 100 }, () => ({
        ...observedWorkerPreviewSummaries[0],
        preview_id: undefined,
      })),
    },
    { previews: [...observedWorkerPreviewSummaries, ...observedWorkerPreviewSummaries] },
  ])("rejects missing or repeated Preview IDs within a page", async ({ previews }) => {
    const requests = stubPreviewReads([observedPreviewWorkerBuildSettings, previews]);
    await expect(readCloudflareWorkerBranchPreviewUrls(previewArgs)).rejects.toThrow(
      "omitted or repeated",
    );
    expect(requests).toHaveLength(2);
  });

  it("rejects a Preview ID repeated from an earlier full page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...observedWorkerPreviewSummaries[0],
      preview_id: index.toString(16).padStart(32, "0"),
    }));
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      firstPage,
      [firstPage[0]],
    ]);
    await expect(readCloudflareWorkerBranchPreviewUrls(previewArgs)).rejects.toThrow(
      "omitted or repeated",
    );
    expect(requests).toHaveLength(3);
  });

  it.each([
    { ...observedWorkerRuntimePreview, id: "f".repeat(32) },
    { ...observedWorkerRuntimePreview, urls: [] },
    {
      ...observedWorkerRuntimePreview,
      urls: [...observedWorkerRuntimePreview.urls, ...observedWorkerRuntimePreview.urls],
    },
    { ...observedWorkerRuntimePreview, urls: ["https://untrusted.example"] },
    { ...observedWorkerRuntimePreview, urls: ["https://branch-another-worker.rir.workers.dev"] },
  ])("omits the URL when runtime identity or URL authority is not proven", async (preview) => {
    stubPreviewReads([observedPreviewWorkerBuildSettings, observedWorkerPreviewSummaries, preview]);
    expect(await readCloudflareWorkerBranchPreviewUrls(previewArgs)).toEqual(new Map());
  });
});

describe("native Worker Builds", () => {
  it("classifies captured legacy settings without requiring two trigger UUIDs", async () => {
    stubNativeBuilds({ settings: observedLegacyWorkerBuildSettings });
    await expect(
      readCloudflareWorkerBuildsDiscoveryForIdentity({
        ...buildDiscoveryArgs(),
        expectedRepoId: observedLegacyWorkerBuildSettings.git_repository.repo_id,
      }),
    ).resolves.toEqual({
      repository: { state: "ready", rootDirectory: "/", builds: { state: "legacy_previews" } },
      builds: { state: "not_connected" },
    });
  });

  it("rejects different production and preview roots", () => {
    const settings = {
      ...observedLegacyWorkerBuildSettings,
      previews_base_config: {
        ...observedLegacyWorkerBuildSettings.previews_base_config,
        root_directory: "apps/other",
      },
    };
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        settings,
        expectedRepoId: observedLegacyWorkerBuildSettings.git_repository.repo_id,
        defaultBranch: "main",
      }),
    ).toEqual({ state: "ambiguous", reason: "multiple_root_directories" });
  });

  it("uses the production marker when no preview marker exists", async () => {
    stubNativeBuilds({ settings: observedNativeWorkerBuildSettings });
    await expect(readCloudflareWorkerConvexBuildAccess(buildDiscoveryArgs())).resolves.toEqual({
      state: "configured",
      convexProject: { teamId: "522530", projectId: "3108337" },
    });
  });

  it("reports incomplete access when the preview key is missing", async () => {
    stubNativeBuilds({
      settings: {
        ...observedNativeWorkerBuildSettings,
        previews_base_config: {
          ...observedNativeWorkerBuildSettings.previews_base_config,
          environment_variables: {},
        },
      },
    });
    await expect(readCloudflareWorkerConvexBuildAccess(buildDiscoveryArgs())).resolves.toEqual({
      state: "incomplete",
      convexProject: { teamId: "522530", projectId: "3108337" },
    });
  });
});
