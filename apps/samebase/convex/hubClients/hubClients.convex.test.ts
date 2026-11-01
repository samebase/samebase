import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  observedBaseAlchemyProductionDeployment,
  observedBaseAlchemyProject,
} from "../repository/fixtures/observedAlchemyState";
import { makeConvexTest, sealTestCredentials, testCredential } from "../test.setup";

// t.fetch loads convex/http.ts, which imports these modules that only a build and a deploy write.
vi.mock("../../dist/server/server.js", () => ({ default: { fetch: async () => new Response() } }));
vi.mock("../../.convex-hosting/version.js", () => ({ versionId: "test" }));
vi.mock("../dist/server/server.js", () => ({ default: { fetch: async () => new Response() } }));
vi.mock("../.convex-hosting/version.js", () => ({ versionId: "test" }));

type ConvexTest = ReturnType<typeof makeConvexTest>;

const HUB_ISSUER = "https://hub.example.test";
const HUB_KEY = "hub-registration-key";
const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const TEAM_ID = "38516";
const REPOSITORY_ID = "74";
const OWNER_ID = "65";
/** The first 32 hex characters of the SHA-256 of `my-app`, from `shasum -a 256`. */
const APP_HASH = "4c9a75cca717efb68c856f26ba825073";

const production = observedBaseAlchemyProductionDeployment;
const project = observedBaseAlchemyProject;
/** The observed row, changed to the preview that a stage `pr-12` deploys, in a European region. */
const preview = {
  ...production,
  name: "calm-cow-456",
  deploymentType: "preview",
  previewIdentifier: "pr-12",
  isDefault: false,
  reference: "preview/pr-12",
  deploymentUrl: "https://calm-cow-456.eu-west-1.convex.cloud",
};
const otherPreview = {
  ...preview,
  name: "quick-fox-789",
  previewIdentifier: "pr-13",
  reference: "preview/pr-13",
  deploymentUrl: "https://quick-fox-789.convex.cloud",
};

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

/**
Answers GitHub's key set, the Convex Management API, and the hub. Each request to the hub is
recorded, and `hub` chooses its answer. A deployment that is not in `deployments` answers 404.
*/
function stubProviders(
  args: {
    deployments?: { name: string }[];
    hub?: (path: string) => Response | Promise<Response>;
    team?: number;
  } = {},
) {
  const deployments = args.deployments ?? [production, preview, otherPreview];
  const hubRequests: { url: string; authorization: string | null; body: unknown }[] = [];
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
      if (request.headers.get("Authorization") !== "Bearer convex-oauth-token") {
        throw new Error(`A provider call without the organization's token: ${request.url}`);
      }
      if (pathname === `/v1/projects/${project.id}`) {
        return jsonResponse({ ...project, teamId: args.team ?? project.teamId });
      }
      if (pathname === `/v1/projects/${project.id}/list_deployments`) {
        return jsonResponse(deployments.filter((deployment) => deployment !== production));
      }
      const deployment = deployments.find(
        (candidate) => pathname === `/v1/deployments/${candidate.name}`,
      );
      // GET /deployments/{name} answers no preview identifier (packages/alchemy-convex/src/Deployment.ts).
      return deployment
        ? jsonResponse({ ...deployment, previewIdentifier: null })
        : jsonResponse({ code: "DeploymentNotFound" }, 404);
    }),
  );
  return hubRequests;
}

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
  await t.run(async (ctx) => {
    await ctx.db.patch(organizationId, { convexTeam: { teamId: TEAM_ID } });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        connectedByUserId: userId,
        updatedAt: 1,
        auth: { method: "oauth", credential: testCredential("convex-oauth-token") },
      },
    });
  });
  await sealTestCredentials(t);
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
      deployment: production.name,
      softwareVersion: "abc123",
      ...body,
    }),
  });
}

const deletionOptions = {
  removeGithubRepo: false,
  removeConvexProvision: false,
  removeCloudflareProvision: false,
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

    it("refuses an organization without a Convex connection", async () => {
      const { t, organizationId } = await seedConnectedRepository();
      await t.run(async (ctx) => {
        const credentials = await ctx.db
          .query("organizationProviderCredentials")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .unique();
        if (credentials) {
          await ctx.db.delete(credentials._id);
        }
      });
      stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "convex_not_connected",
      });
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

  describe("the deployment", () => {
    it("refuses a pull_request run that names production", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken(pullRequestClaims));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "deployment_not_allowed_for_run",
      });
      expect(hubRequests).toEqual([]);
    });

    it("refuses a pull_request run that names the preview of another pull request", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken(pullRequestClaims), {
        deployment: otherPreview.name,
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "deployment_not_allowed_for_run",
      });
      expect(hubRequests).toEqual([]);
    });

    it("refuses a run of main that names a preview", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      const response = await postHubClient(t, await signToken(), { deployment: preview.name });

      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "deployment_not_allowed_for_run",
      });
    });

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

    it("refuses a deployment in another team", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders({ team: 99 });

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "deployment_not_in_team",
      });
      expect(hubRequests).toEqual([]);
    });

    it("refuses a deployment that the connection cannot read", async () => {
      const { t } = await seedConnectedRepository();
      stubProviders({ deployments: [] });

      const response = await postHubClient(t, await signToken());

      expect(await response.json()).toEqual({
        error: "not_allowed",
        reason: "deployment_not_in_team",
      });
    });

    it.each([
      ["a name with a path", { deployment: "../projects/1" }],
      ["no app", { app: "" }],
      ["no version", { softwareVersion: "" }],
      ["a very long version", { softwareVersion: "v".repeat(257) }],
      ["a body that is not text", { app: 1 }],
    ])("answers 400 for %s", async (_, body) => {
      const { t } = await seedConnectedRepository();
      stubProviders();

      const response = await postHubClient(t, await signToken(), body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
      expect(await readRateLimits(t)).toEqual([]);
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
            redirect_uris: ["https://ideal-dolphin-15.convex.site/auth/hub/callback"],
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
        redirect_uri: "https://ideal-dolphin-15.convex.site/auth/hub/callback",
      });
    });

    it("registers a preview in its own app, on the URL of its region", async () => {
      const { t } = await seedConnectedRepository();
      const hubRequests = stubProviders();

      const response = await postHubClient(t, await signToken(pullRequestClaims), {
        deployment: preview.name,
      });

      expect(hubRequests.map((request) => request.body)).toEqual([
        {
          tenant_id: "gh-74",
          software_id: `gh-74-${APP_HASH}-preview`,
          software_version: "abc123",
          redirect_uris: ["https://calm-cow-456.eu-west-1.convex.site/auth/hub/callback"],
          deployment_type: "preview",
          client_name: "pr-12",
          token_endpoint_auth_method: "client_secret_post",
        },
      ]);
      expect(response.status).toBe(201);
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
    const revisions = hubRequests.map(({ body }) =>
      typeof body === "object" && body !== null && "revision" in body ? Number(body.revision) : NaN,
    );
    expect(revisions).toHaveLength(2);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(2);
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
