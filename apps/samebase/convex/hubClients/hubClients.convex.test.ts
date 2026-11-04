import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

// t.fetch loads convex/http.ts, which imports these modules that only a build and a deploy write.
vi.mock("../../dist/server/server.js", () => ({ default: { fetch: async () => new Response() } }));
vi.mock("../../.convex-hosting/version.js", () => ({ versionId: "test" }));
vi.mock("../dist/server/server.js", () => ({ default: { fetch: async () => new Response() } }));
vi.mock("../.convex-hosting/version.js", () => ({ versionId: "test" }));

type ConvexTest = ReturnType<typeof makeConvexTest>;

const HUB_ISSUER = "https://hub.example.test";
const HUB_KEY = "hub-registration-key";
const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const REPOSITORY_ID = "74";
const OWNER_ID = "65";
/** The first 32 hex characters of the SHA-256 of `my-app`, from `shasum -a 256`. */
const APP_HASH = "4c9a75cca717efb68c856f26ba825073";
const PRODUCTION_HOST = "https://ideal-dolphin-15.convex.site";
const PRODUCTION_CALLBACK = `${PRODUCTION_HOST}/auth/hub/callback`;

/**
The claims of the example token on
https://docs.github.com/en/actions/concepts/security/openid-connect, read on 2026-11-01. Only `aud`
and the claims that a test names differ, and the times are set when a test signs.
*/
const documentedClaims = {
  jti: "example-id",
  sub: "repo:octo-org/octo-repo:environment:prod",
  environment: "prod",
  aud: "samebase",
  ref: "refs/heads/main",
  sha: "example-sha",
  repository: "octo-org/octo-repo",
  repository_owner: "octo-org",
  actor_id: "12",
  repository_visibility: "private",
  repository_id: REPOSITORY_ID,
  repository_owner_id: OWNER_ID,
  run_id: "example-run-id",
  run_number: "10",
  run_attempt: "2",
  runner_environment: "github-hosted",
  actor: "octocat",
  workflow: "example-workflow",
  head_ref: "",
  base_ref: "",
  event_name: "push",
  ref_type: "branch",
  job_workflow_ref: "octo-org/octo-automation/.github/workflows/oidc.yml@refs/heads/main",
  iss: "https://token.actions.githubusercontent.com",
};
const pullRequestClaims = { event_name: "pull_request", ref: "refs/pull/12/merge" };

let signingKey: CryptoKey;
let foreignKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const signing = await generateKeyPair("RS256");
  signingKey = signing.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  publicJwk = { ...(await exportJWK(signing.publicKey)), kid: "github-key", alg: "RS256" };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function signToken(
  claims: Record<string, unknown> = {},
  options: { key?: CryptoKey; expiresInSeconds?: number; withoutExpiry?: boolean } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const expiry = options.withoutExpiry ? {} : { exp: now + (options.expiresInSeconds ?? 300) };
  return await new SignJWT({ ...documentedClaims, ...claims, nbf: now - 600, iat: now, ...expiry })
    .setProtectedHeader({ alg: "RS256", kid: "github-key", typ: "JWT" })
    .sign(options.key ?? signingKey);
}

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** The hub's reply on `POST /register`, with the fields of `clientInformation` in registration.ts. */
const hubClientReply = () =>
  jsonResponse(
    {
      client_id: "cl_test",
      client_id_issued_at: 1,
      client_secret_expires_at: 0,
      registration_client_uri: `${HUB_ISSUER}/register/cl_test`,
      client_secret: "raw-client-secret",
      registration_access_token: "raw-registration-token",
    },
    201,
  );

/** The requests for `/samebase-verification.json` since the last `stubProviders`, with their options. */
let fileRequests: { url: string; init: RequestInit | undefined }[] = [];

/**
Answers GitHub's key set, the hub, and every other host's `/samebase-verification.json`. Each request
to the hub is recorded, and `hub` chooses its answer. `host` answers the file, which by default names
this repository.
*/
function stubProviders(
  args: {
    hub?: (path: string) => Response | Promise<Response>;
    host?: () => Response | Promise<Response>;
  } = {},
) {
  const hubRequests: { url: string; authorization: string | null; body: unknown }[] = [];
  fileRequests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const { pathname } = new URL(request.url);

      if (request.url === JWKS_URL) {
        return jsonResponse({ keys: [publicJwk] });
      }
      if (request.url.startsWith(`${HUB_ISSUER}/`)) {
        hubRequests.push({
          url: request.url,
          authorization: request.headers.get("Authorization"),
          body: await request.json(),
        });
        return await (args.hub ?? hubClientReply)(pathname);
      }
      fileRequests.push({ url: request.url, init });
      return await (args.host ?? (() => jsonResponse({ repository: REPOSITORY_ID })))();
    }),
  );
  return hubRequests;
}

/** A body that arrives in chunks with no Content-Length, as a host may send it. */
const streamedResponse = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );

/** Connects the repository through the real flow, while the feature is off. */
async function connectRepository(
  t: ConvexTest,
  ids: { organizationId: Id<"organizations">; userId: Id<"users"> },
) {
  const repository = await t.mutation(
    internal.repository.records.createInitializingExistingRepositoryForUser,
    {
      organizationId: ids.organizationId,
      userId: ids.userId,
      githubRepositoryDatabaseId: REPOSITORY_ID,
      githubOwnerLogin: "octo-org",
      githubRepositoryName: "octo-repo",
    },
  );
  await t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
    repositoryId: repository.repositoryId,
    runId: repository.runId,
    userId: ids.userId,
    githubRepositoryDatabaseId: REPOSITORY_ID,
    githubOwnerLogin: "octo-org",
    githubRepositoryName: "octo-repo",
    defaultBranch: "main",
    visibility: "private",
  });
  return repository;
}

async function seedOrganization(t: ConvexTest) {
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        state: "active",
        email: "octocat@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      }),
  );
  const { organizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId,
      githubOwnerId: OWNER_ID,
      githubOwnerType: "organization",
      githubOwnerLogin: "octo-org",
      githubInstallationId: "installation-65",
    },
  );
  return { organizationId, userId };
}

function turnFeatureOn() {
  vi.stubEnv("HUB_ISSUER", HUB_ISSUER);
  vi.stubEnv("HUB_CLIENT_ID", "samebase-production-client");
  vi.stubEnv("HUB_REGISTRATION_KEY", HUB_KEY);
}

async function seedConnectedRepository() {
  const t = makeConvexTest();
  const ids = await seedOrganization(t);
  const repository = await connectRepository(t, ids);
  turnFeatureOn();
  return { t, ...ids, ...repository };
}

async function postHubClient(
  t: ConvexTest,
  token: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return await t.fetch("/api/hub-clients", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      app: "my-app",
      redirectUri: PRODUCTION_CALLBACK,
      softwareVersion: "abc123",
      ...body,
    }),
  });
}

const deletionOptions = {
  removeGithubRepo: false,
};

/** A repository can leave Samebase only after its setup run ends. */
async function finishProvisioningRun(
  t: ConvexTest,
  runId: Id<"workflow_repositoryProvisioning_runs">,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { state: "succeeded", currentStep: "finish" });
  });
}

async function readRateLimits(t: ConvexTest) {
  return await t.run(async (ctx) => await ctx.db.query("hubClientRateLimits").collect());
}

async function readRegistrations(t: ConvexTest) {
  return await t.run(async (ctx) => await ctx.db.query("hubClientRegistrations").collect());
}

describe("POST /api/hub-clients", () => {
  describe("the off state", () => {
    it("answers 404 without a registration key, before it reads the token", async () => {
      const { t } = await seedConnectedRepository();
      vi.stubEnv("HUB_REGISTRATION_KEY", "");
      stubProviders();

      const response = await postHubClient(t, "not-a-token");

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "off" });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("answers 404 on a backend with the no-hub values", async () => {
      const { t } = await seedConnectedRepository();
      vi.stubEnv("HUB_ISSUER", "http://127.0.0.1:1");
      vi.stubEnv("HUB_CLIENT_ID", "no-hub");
      stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "off" });
    });
  });

  describe("the GitHub token", () => {
    const tokens = {
      "a bad signature": () => signToken({}, { key: foreignKey }),
      "a wrong audience": () => signToken({ aud: "https://github.com/octo-org" }),
      "an audience list that holds samebase": () => signToken({ aud: ["samebase", "other"] }),
      "a wrong issuer": () => signToken({ iss: "https://issuer.example.test" }),
      "an expired token": () => signToken({}, { expiresInSeconds: -60 }),
      "a token that never expires": () => signToken({}, { withoutExpiry: true }),
    };

    it.each(Object.entries(tokens))("refuses %s and touches no table", async (_, sign) => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await sign());

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid_token" });
      expect(hubRequests).toEqual([]);
      expect(await readRateLimits(t)).toEqual([]);
    });

    it("refuses a request with no token", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      const response = await t.fetch("/api/hub-clients", { method: "POST", body: "{}" });

      expect(response.status).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("answers 502, not 401, when GitHub's key set cannot be read", async () => {
      const { t } = await seedConnectedRepository();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("Service Unavailable", { status: 503 })),
      );

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "github_unavailable" });
    });

    it.each(["dynamic", "pull_request_target", "schedule", "workflow_run"])(
      "refuses the event %s and touches no table",
      async (eventName) => {
        const { t } = await seedConnectedRepository();
        const hubRequests = stubProviders();

        const response = await postHubClient(t, await signToken({ event_name: eventName }));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "not_allowed", reason: "run_not_allowed" });
        expect(hubRequests).toEqual([]);
        expect(await readRateLimits(t)).toEqual([]);
      },
    );
  });

  describe("the repository", () => {
    it("refuses a repository that is not connected", async () => {
      const t = makeConvexTest();
      await seedOrganization(t);
      turnFeatureOn();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "repository_not_connected",
      });
      expect(hubRequests).toEqual([]);
    });

    it("refuses a repository that is being removed", async () => {
      const { t, repositoryId, runId, userId } = await seedConnectedRepository();
      await finishProvisioningRun(t, runId);
      vi.stubEnv("HUB_REGISTRATION_KEY", "");
      await t.mutation(internal.repository.deletion.runs.createInitialRun, {
        userId,
        repositoryId,
        options: deletionOptions,
      });
      turnFeatureOn();
      stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "repository_not_connected",
      });
    });

    it("refuses a run of another owner, which a transfer gives", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken({ repository_owner_id: "66" }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "owner_mismatch" });
      expect(hubRequests).toEqual([]);
      expect(await readRateLimits(t)).toEqual([]);
    });

    it("needs no Convex connection", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(201);
    });
  });

  describe("the rate limits", () => {
    it("limits one repository", async () => {
      const { t, repositoryId } = await seedConnectedRepository();
      await t.run(async (ctx) => {
        await ctx.db.insert("hubClientRateLimits", {
          scope: "repository",
          repositoryId,
          count: 30,
        });
      });
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "rate_limited" });
      expect(hubRequests).toEqual([]);
    });

    it("limits one organization across its repositories", async () => {
      const { t, organizationId } = await seedConnectedRepository();
      await t.run(async (ctx) => {
        await ctx.db.insert("hubClientRateLimits", {
          scope: "organization",
          organizationId,
          count: 100,
        });
      });
      stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(429);
    });

    it("starts a new window after an hour", async () => {
      vi.useFakeTimers();
      const { t, repositoryId } = await seedConnectedRepository();
      await t.run(async (ctx) => {
        await ctx.db.insert("hubClientRateLimits", {
          scope: "repository",
          repositoryId,
          count: 30,
        });
      });
      const token = await signToken({}, { expiresInSeconds: 7_200 });
      vi.setSystemTime(Date.now() + 60 * 60 * 1_000 + 1);
      stubProviders();

      const response = await postHubClient(t, token);

      expect(response.status).toBe(201);
    });

    it("counts each request against the repository and the organization", async () => {
      const { t, organizationId, repositoryId } = await seedConnectedRepository();
      stubProviders();
      const token = await signToken();

      await postHubClient(t, token);
      await postHubClient(t, token);

      expect(await readRateLimits(t)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: "repository", repositoryId, count: 2 }),
          expect.objectContaining({ scope: "organization", organizationId, count: 2 }),
        ]),
      );
    });
  });

  describe("the run", () => {
    it.each([
      ["a push on another branch", { event_name: "push", ref: "refs/heads/feature" }],
      ["a push of a tag", { event_name: "push", ref: "refs/tags/main" }],
      ["a dispatch on another branch", { event_name: "workflow_dispatch", ref: "refs/heads/dev" }],
      ["a pull request head ref", { event_name: "pull_request", ref: "refs/pull/12/head" }],
      ["a pull_request run on a branch", { event_name: "pull_request", ref: "refs/heads/main" }],
    ])("refuses %s", async (_, claims) => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken(claims));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "run_not_allowed" });
      expect(hubRequests).toEqual([]);
    });

    it.each([
      ["no app", { app: "" }],
      ["no version", { softwareVersion: "" }],
      ["a very long version", { softwareVersion: "v".repeat(257) }],
      ["a body that is not text", { app: 1 }],
      ["no return address", { redirectUri: undefined }],
      ["an http return address", { redirectUri: "http://ideal-dolphin-15.convex.site/cb" }],
      ["a fragment", { redirectUri: `${PRODUCTION_CALLBACK}#top` }],
      ["an empty fragment", { redirectUri: `${PRODUCTION_CALLBACK}#` }],
      ["user info", { redirectUri: "https://user:pass@ideal-dolphin-15.convex.site/cb" }],
      ["an IPv4 address", { redirectUri: "https://127.0.0.1/cb" }],
      ["an IPv4 address in hex", { redirectUri: "https://0x7f000001/cb" }],
      ["an IPv6 address", { redirectUri: "https://[::1]/cb" }],
      ["localhost", { redirectUri: "https://localhost/cb" }],
      ["a name under localhost", { redirectUri: "https://app.localhost/cb" }],
      ["a very long address", { redirectUri: `${PRODUCTION_HOST}/${"a".repeat(2_048)}` }],
    ])("answers 400 for %s and fetches nothing", async (_, body) => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      const response = await postHubClient(t, await signToken(), body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
      expect(await readRateLimits(t)).toEqual([]);
      expect(fileRequests).toEqual([]);
    });
  });

  describe("the host", () => {
    it("reads the file at the root of the return address's origin, with no redirects", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      await postHubClient(t, await signToken(), {
        redirectUri: "https://app.example.com:8443/api/auth/callback/hub?x=1",
      });

      expect(fileRequests).toEqual([
        {
          url: "https://app.example.com:8443/samebase-verification.json",
          init: expect.objectContaining({ redirect: "manual" }),
        },
      ]);
      expect(fileRequests[0]?.init?.credentials).toBeUndefined();
    });

    it.each([
      ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
      ["a failed connection", () => Promise.reject(new TypeError("fetch failed"))],
    ])("refuses with host_unreachable on %s", async (_, host) => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders({ host });

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "host_unreachable" });
      expect(hubRequests).toEqual([]);
    });

    it.each([
      ["404", () => new Response("Not Found", { status: 404 })],
      [
        "a redirect, which it never follows",
        () =>
          new Response(null, {
            status: 301,
            headers: { Location: "https://elsewhere.example.com/samebase-verification.json" },
          }),
      ],
    ])("refuses with verification_file_missing on %s", async (_, host) => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders({ host });

      const response = await postHubClient(t, await signToken());

      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "verification_file_missing",
      });
      expect(hubRequests).toEqual([]);
      expect(fileRequests).toHaveLength(1);
    });

    it.each([
      ["text that is not JSON", () => new Response("<html></html>")],
      ["JSON without the id", () => jsonResponse({ repo: REPOSITORY_ID })],
      ["a name instead of the id", () => jsonResponse({ repository: "octo-org/octo-repo" })],
      ["a fraction", () => jsonResponse({ repository: 74.5 })],
      [
        "a body over 4 KiB",
        () => jsonResponse({ repository: REPOSITORY_ID, pad: "x".repeat(4_096) }),
      ],
      [
        "a streamed body over 4 KiB with no length",
        () =>
          streamedResponse([`{"repository":"${REPOSITORY_ID}","pad":"`, "x".repeat(5_000), '"}']),
      ],
    ])("refuses with verification_file_invalid on %s", async (_, host) => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders({ host });

      const response = await postHubClient(t, await signToken());

      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "verification_file_invalid",
      });
      expect(hubRequests).toEqual([]);
    });

    it("refuses with repository_mismatch on another id, and never shows that id", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders({ host: () => jsonResponse({ repository: "999" }) });

      const response = await postHubClient(t, await signToken());
      const text = await response.text();

      expect(JSON.parse(text)).toEqual({ error: "not_allowed", reason: "repository_mismatch" });
      expect(text).not.toContain("999");
      expect(hubRequests).toEqual([]);
    });

    it.each([
      ["a string", () => jsonResponse({ repository: REPOSITORY_ID })],
      ["a number", () => jsonResponse({ repository: Number(REPOSITORY_ID) })],
      ["more members and no Content-Type", () => new Response(`{"repository":74,"note":"hi"}`)],
      ["a streamed body", () => streamedResponse(['{"repos', `itory":"${REPOSITORY_ID}"}`])],
    ])("accepts the id as %s", async (_, host) => {
      const { t } = await seedConnectedRepository();
      stubProviders({ host });

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(201);
    });

    it("checks the host after the repository and the rate limits", async () => {
      const t = makeConvexTest();
      await seedOrganization(t);
      turnFeatureOn();
      stubProviders();

      await postHubClient(t, await signToken());

      expect(fileRequests).toEqual([]);
    });
  });

  describe("the hub", () => {
    it("registers production with exactly the values that Samebase builds", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken(), {
        // The body cannot choose these.
        tenant_id: "gh-1",
        redirect_uris: ["https://attacker.example.test/callback"],
        deployment_type: "preview",
      });

      expect(hubRequests).toEqual([
        {
          url: `${HUB_ISSUER}/register`,
          authorization: `Bearer ${HUB_KEY}`,
          body: {
            tenant_id: "gh-74",
            software_id: `gh-74-${APP_HASH}`,
            software_version: "abc123",
            redirect_uris: [PRODUCTION_CALLBACK],
            deployment_type: "production",
            client_name: "prod",
            token_endpoint_auth_method: "client_secret_post",
          },
        },
      ]);
      expect(response.status).toBe(201);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({
        issuer: HUB_ISSUER,
        client_id: "cl_test",
        client_secret: "raw-client-secret",
        registration_access_token: "raw-registration-token",
        registration_client_uri: `${HUB_ISSUER}/register/cl_test`,
        redirect_uri: PRODUCTION_CALLBACK,
      });
    });

    it("registers a preview in its own app, on the exact address that the run sent", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken(pullRequestClaims), {
        redirectUri: "https://calm-cow-456.eu-west-1.convex.site/api/auth/callback/hub",
      });

      expect(hubRequests.map((request) => request.body)).toEqual([
        {
          tenant_id: "gh-74",
          software_id: `gh-74-${APP_HASH}-preview`,
          software_version: "abc123",
          redirect_uris: ["https://calm-cow-456.eu-west-1.convex.site/api/auth/callback/hub"],
          deployment_type: "preview",
          client_name: "pr-12",
          token_endpoint_auth_method: "client_secret_post",
        },
      ]);
      expect(response.status).toBe(201);
    });

    it("registers a preview of a pull_request run on the production address, which can redeem no code of it", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken(pullRequestClaims));

      expect(response.status).toBe(201);
      expect(hubRequests.map((request) => request.body)).toEqual([
        expect.objectContaining({
          software_id: `gh-74-${APP_HASH}-preview`,
          redirect_uris: [PRODUCTION_CALLBACK],
          deployment_type: "preview",
        }),
      ]);
    });

    it("records what the token said, with the client ID and no secret", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      await postHubClient(t, await signToken());

      expect(await readRegistrations(t)).toEqual([
        expect.objectContaining({
          clientId: "cl_test",
          githubRepositoryDatabaseId: REPOSITORY_ID,
          githubOwnerId: OWNER_ID,
          githubRepository: "octo-org/octo-repo",
          githubActorId: "12",
          githubActorLogin: "octocat",
          commitSha: "example-sha",
          stage: "prod",
          app: "my-app",
          redirectUri: PRODUCTION_CALLBACK,
        }),
      ]);
      expect(JSON.stringify(await readRegistrations(t))).not.toContain("raw-");
    });

    it("records nothing when the hub refuses", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders({ hub: () => jsonResponse({ error: "access_denied" }, 403) });

      await postHubClient(t, await signToken());

      expect(await readRegistrations(t)).toEqual([]);
    });

    it("accepts a workflow_dispatch run on main", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      const response = await postHubClient(
        t,
        await signToken({ event_name: "workflow_dispatch", ref: "refs/heads/main" }),
      );

      expect(response.status).toBe(201);
    });

    it("keeps the raw secret out of every table and every log", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders();
      const logs = (["log", "info", "warn", "error"] as const).map((method) =>
        vi.spyOn(console, method),
      );

      await postHubClient(t, await signToken());

      expect(JSON.stringify(logs.map((log) => log.mock.calls))).not.toContain("raw-");
      expect(JSON.stringify(await readRateLimits(t))).not.toContain("raw-");
      const scheduled = await t.run(
        async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
      );
      expect(JSON.stringify(scheduled)).not.toContain("raw-");
    });

    it("answers not_allowed when the hub refuses the tenant", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders({
        hub: () =>
          jsonResponse(
            { error: "access_denied", error_description: "Registration refused: suspended." },
            403,
          ),
      });

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "hub_refused" });
    });

    it.each([
      ["an outage", () => new Response("Bad Gateway", { status: 502 })],
      ["a refused key", () => jsonResponse({ error: "invalid_token" }, 401)],
      ["a bad reply", () => jsonResponse({ client_id: "cl_test" }, 201)],
    ])("answers hub_unavailable on %s", async (_, hub) => {
      const { t } = await seedConnectedRepository();
      stubProviders({ hub });

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "hub_unavailable" });
    });

    it("answers hub_unavailable when the hub cannot be reached", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders({
        hub: () => {
          throw new TypeError("fetch failed");
        },
      });

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "hub_unavailable" });
    });
  });
});

describe("the hub's tenant switch", () => {
  const tenantSwitchCall = (connected: boolean, revision: unknown = expect.any(Number)) => ({
    url: `${HUB_ISSUER}/tenant-connection`,
    authorization: `Bearer ${HUB_KEY}`,
    body: { tenant_id: "gh-74", connected, revision },
  });

  it("suspends the tenant when the repository leaves Samebase", async () => {
    vi.useFakeTimers();
    const { t, repositoryId, runId, userId } = await seedConnectedRepository();
    await finishProvisioningRun(t, runId);
    const hubRequests = stubProviders({ hub: () => new Response(null, { status: 204 }) });

    await t.mutation(internal.repository.deletion.runs.createInitialRun, {
      userId,
      repositoryId,
      options: deletionOptions,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    expect(hubRequests).toEqual([tenantSwitchCall(false)]);
  });

  it("calls the hub again after an outage, with the same revision", async () => {
    vi.useFakeTimers();
    const { t, repositoryId, runId, userId } = await seedConnectedRepository();
    await finishProvisioningRun(t, runId);
    let answers = 0;
    const hubRequests = stubProviders({
      hub: () => new Response(null, { status: (answers += 1) === 1 ? 503 : 204 }),
    });

    await t.mutation(internal.repository.deletion.runs.createInitialRun, {
      userId,
      repositoryId,
      options: deletionOptions,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    expect(hubRequests).toEqual([tenantSwitchCall(false), tenantSwitchCall(false)]);
    expect(hubRequests[1]).toEqual(hubRequests[0]);
  });

  it("sends a newer revision when the same GitHub repository connects again", async () => {
    vi.useFakeTimers();
    const { t, organizationId, repositoryId, runId, userId } = await seedConnectedRepository();
    await finishProvisioningRun(t, runId);
    const hubRequests = stubProviders({ hub: () => new Response(null, { status: 204 }) });
    await t.mutation(internal.repository.deletion.runs.createInitialRun, {
      userId,
      repositoryId,
      options: deletionOptions,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);
    await t.run(async (ctx) => {
      await ctx.db.delete(repositoryId);
    });

    await connectRepository(t, { organizationId, userId });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    expect(hubRequests).toEqual([tenantSwitchCall(false), tenantSwitchCall(true)]);
    // The repository row is gone between the two, and the count goes on.
    expect(hubRequests).toEqual([tenantSwitchCall(false, 1), tenantSwitchCall(true, 2)]);
  });

  it("sends the change it was started with, whatever the repository is now", async () => {
    const { t } = await seedConnectedRepository();
    const hubRequests = stubProviders({ hub: () => new Response(null, { status: 204 }) });

    await t.action(internal.hubClients.tenantConnection.sendTenantConnection, {
      githubRepositoryDatabaseId: REPOSITORY_ID,
      connected: false,
      revision: 7,
    });

    expect(hubRequests).toEqual([tenantSwitchCall(false, 7)]);
  });

  it("calls the hub for neither change while the feature is off", async () => {
    vi.useFakeTimers();
    const t = makeConvexTest();
    const ids = await seedOrganization(t);
    const hubRequests = stubProviders();

    const { repositoryId, runId } = await connectRepository(t, ids);
    await finishProvisioningRun(t, runId);
    await t.mutation(internal.repository.deletion.runs.createInitialRun, {
      userId: ids.userId,
      repositoryId,
      options: deletionOptions,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    expect(hubRequests).toEqual([]);
  });

  it("removes the repository's rate limit with the repository", async () => {
    const { t, repositoryId, runId, userId } = await seedConnectedRepository();
    vi.stubEnv("HUB_REGISTRATION_KEY", "");
    await finishProvisioningRun(t, runId);
    await t.run(async (ctx) => {
      await ctx.db.insert("hubClientRateLimits", { scope: "repository", repositoryId, count: 1 });
    });
    const { deletionRunId } = await t.mutation(internal.repository.deletion.runs.createInitialRun, {
      userId,
      repositoryId,
      options: deletionOptions,
    });

    await t.mutation(internal.repository.deletion.cleanup.cleanupRepositoryLocalDataStepBatch, {
      repositoryId,
      runId: deletionRunId,
      step: "cleanup_runtime_state",
    });

    expect(await readRateLimits(t)).toEqual([]);
  });
});
