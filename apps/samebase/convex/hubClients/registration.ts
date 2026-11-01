import { isRecord } from "@samebase/dependent";
import {
  array as sureArray,
  bad,
  good,
  literal as sureLiteral,
  object as sureObject,
  pure,
  string as sureString,
} from "@samebase/sure";
import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import { createLocalJWKSet, errors as joseErrors, jwtVerify } from "jose";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { httpAction, internalMutation, type MutationCtx } from "../_generated/server";
import {
  createConvexManagementClient,
  isConvexCloudDeployment,
} from "../convexManagementApi/client";
import { ConvexManagementApiError } from "../convexManagementApi/errors";
import { ConvexManagement } from "../convexManagementApi/generated/sdk.gen";
import { toErrorMessage } from "../jsonUtils";
import { sha256Hex } from "../mcp/tokens";
import { organizationProviderCredentialAad } from "../organization/providerCredentialModel";
import { getOrganizationProviderConfiguration } from "../organizationProviderCredentials";
import { readConvexPreviewDeployments } from "../repository/convexProjectResources";
import { isLiveConnectedRepository } from "../repository/state";
import { openSecret, vSealedSecret } from "../sealedSecret";
import { readHub, readRepositoryByGitHubId } from "./tenantConnection";

const { id, literal, object, string, union } = v;

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
const GITHUB_OIDC_AUDIENCE = "samebase";
const HUB_CALLBACK_PATH = "/auth/hub/callback";
const REQUEST_TIMEOUT_MS = 10_000;
/** The hub stores the version on every client row. A commit hash or a version fits many times. */
const MAX_SOFTWARE_VERSION_LENGTH = 256;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;
/** A run asks only when it has no saved client: later deploys renew at the hub directly. */
const REPOSITORY_REQUEST_LIMIT = 30;
const ORGANIZATION_REQUEST_LIMIT = 100;

const sureGitHubKeySet = sureObject({
  keys: sureArray(pure((key) => (isRecord(key) ? good(key) : bad("not object" as const)))),
});

/** `aud` is one exact string: jose alone also accepts a list that holds the audience. */
const sureGitHubClaims = sureObject({
  aud: sureLiteral(GITHUB_OIDC_AUDIENCE),
  event_name: sureString,
  ref: sureString,
  repository_id: sureString,
  repository_owner_id: sureString,
});

const sureRequestBody = sureObject({
  app: sureString,
  deployment: sureString,
  softwareVersion: sureString,
});

/** The 201 reply of the hub's `POST /register` (RFC 7591 section 3.2.1). */
const sureHubClient = sureObject({
  client_id: sureString,
  client_secret: sureString,
  registration_access_token: sureString,
  registration_client_uri: sureString,
});

const vHubClientAdmission = union(
  object({
    status: literal("refused"),
    reason: union(
      literal("repository_not_connected"),
      literal("owner_mismatch"),
      literal("convex_not_connected"),
    ),
  }),
  object({ status: literal("rate_limited") }),
  object({
    status: literal("admitted"),
    organizationId: id("organizations"),
    teamId: string(),
    credential: vSealedSecret,
  }),
);

function reply(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** The reason names a rule of this endpoint and never holds provider text. */
function notAllowed(reason: string): Response {
  return reply(403, { error: "not_allowed", reason });
}

/** GitHub's key set, read for each token: Convex functions keep no memory between requests. */
async function readGitHubKeySet() {
  const response = await fetch(GITHUB_OIDC_JWKS_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const [valid, keySet] = sureGitHubKeySet(response.ok ? await response.json() : null);
  if (!valid) {
    throw new Error(`GitHub answered ${response.status} without a key set.`);
  }
  return keySet;
}

/** The claims of a good token, or null for a bad one. It throws when GitHub cannot be reached. */
async function verifyGitHubToken(token: string) {
  try {
    const { payload } = await jwtVerify(
      token,
      async (header, input) => createLocalJWKSet(await readGitHubKeySet())(header, input),
      {
        algorithms: ["RS256"],
        audience: GITHUB_OIDC_AUDIENCE,
        issuer: GITHUB_OIDC_ISSUER,
        requiredClaims: ["exp"],
      },
    );
    const [valid, claims] = sureGitHubClaims(payload);
    return valid ? claims : null;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      return null;
    }
    throw error;
  }
}

/**
The one stage that a run may ask for, from claims that GitHub signs: `pr-<number>` for a pull
request, or `prod` for main. Every other event is refused, also Dependabot's `dynamic`.
*/
function readRunStage(claims: { event_name: string; ref: string }) {
  switch (claims.event_name) {
    case "pull_request": {
      const pullRequestNumber = /^refs\/pull\/([1-9][0-9]*)\/merge$/.exec(claims.ref)?.[1];
      return pullRequestNumber ? `pr-${pullRequestNumber}` : null;
    }
    case "push":
    case "workflow_dispatch":
      return claims.ref === "refs/heads/main" ? "prod" : null;
    default:
      return null;
  }
}

/** Counts one request in a fixed window, as `feedback.ts` does. False: the window is full. */
async function reserveRequest(
  ctx: MutationCtx,
  args: {
    rateLimit: Doc<"hubClientRateLimits"> | null;
    limit: number;
    first: WithoutSystemFields<Doc<"hubClientRateLimits">>;
  },
): Promise<boolean> {
  const { rateLimit, limit, first } = args;
  if (rateLimit && rateLimit._creationTime + RATE_LIMIT_WINDOW_MS > Date.now()) {
    if (rateLimit.count >= limit) {
      return false;
    }
    await ctx.db.patch(rateLimit._id, { count: rateLimit.count + 1 });
    return true;
  }

  if (rateLimit) {
    await ctx.db.delete(rateLimit._id);
  }
  await ctx.db.insert("hubClientRateLimits", first);
  return true;
}

/**
Finds the connected repository of a verified token, and returns the organization's Convex credential
still sealed. `githubRepositoryDatabaseId` and `githubOwnerId` are numeric GitHub ids that the token
carries, so a rename changes nothing, and a transfer stops at the owner check until the new owner
connects.
*/
export const admitRequest = internalMutation({
  args: {
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
  },
  returns: vHubClientAdmission,
  handler: async (ctx, args) => {
    const repository = await readRepositoryByGitHubId(ctx.db, args.githubRepositoryDatabaseId);
    if (!isLiveConnectedRepository(repository)) {
      return { status: "refused", reason: "repository_not_connected" } as const;
    }
    const { organizationId } = repository;
    const organization = await ctx.db.get(organizationId);
    if (organization?.githubOwnerId !== args.githubOwnerId) {
      return { status: "refused", reason: "owner_mismatch" } as const;
    }

    const repositoryLimit = await ctx.db
      .query("hubClientRateLimits")
      .withIndex("by_repository", (query) => query.eq("repositoryId", repository._id))
      .unique();
    const organizationLimit = await ctx.db
      .query("hubClientRateLimits")
      .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
      .unique();
    const admitted =
      (await reserveRequest(ctx, {
        rateLimit: repositoryLimit,
        limit: REPOSITORY_REQUEST_LIMIT,
        first: { scope: "repository", repositoryId: repository._id, count: 1 },
      })) &&
      (await reserveRequest(ctx, {
        rateLimit: organizationLimit,
        limit: ORGANIZATION_REQUEST_LIMIT,
        first: { scope: "organization", organizationId, count: 1 },
      }));
    if (!admitted) {
      return { status: "rate_limited" } as const;
    }

    const { convexCredential, convexTeam } = await getOrganizationProviderConfiguration(
      ctx.db,
      organizationId,
    );
    if (!convexTeam || convexTeam.teamId !== repository.convexTeamId || !convexCredential) {
      return { status: "refused", reason: "convex_not_connected" } as const;
    }
    return {
      status: "admitted",
      organizationId,
      teamId: convexTeam.teamId,
      credential: convexCredential.auth.credential,
    } as const;
  },
});

/**
The named deployment, if the organization's Convex connection sees it in `teamId`. The token may be
an OAuth team token. These statuses mean that the credential cannot read the object, as `isRefused`
in packages/alchemy-convex/src/Deployment.ts.
*/
async function readDeploymentInTeam(args: { token: string; teamId: string; deployment: string }) {
  const client = createConvexManagementClient({ token: args.token });
  try {
    const deployment = await ConvexManagement.GET["/deployments/{deployment_name}"]({
      client,
      path: { deployment_name: args.deployment },
    });
    if (!isConvexCloudDeployment(deployment)) {
      return null;
    }
    const project = await ConvexManagement.GET["/projects/{project_id}"]({
      client,
      path: { project_id: deployment.projectId },
    });
    return project.teamId === args.teamId ? deployment : null;
  } catch (error) {
    if (error instanceof ConvexManagementApiError && [400, 401, 403, 404].includes(error.status)) {
      return null;
    }
    throw error;
  }
}

/** `GET /deployments/{name}` answers no preview identifier, so a preview comes from the project's list. */
async function isDeploymentOfStage(args: {
  token: string;
  deployment: { name: string; projectId: string; deploymentType: string; isDefault: boolean };
  stage: string;
}): Promise<boolean> {
  if (args.stage === "prod") {
    return args.deployment.deploymentType === "prod" && args.deployment.isDefault;
  }
  if (args.deployment.deploymentType !== "preview") {
    return false;
  }

  const previews = await readConvexPreviewDeployments({
    token: args.token,
    projectId: args.deployment.projectId,
  });
  return (
    previews.find((preview) => preview.name === args.deployment.name)?.previewIdentifier ===
    args.stage
  );
}

/** The verified run of a request, or the reply that refuses it. */
async function readRun(request: Request) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) {
    return reply(401, { error: "invalid_token" });
  }

  let claims;
  try {
    claims = await verifyGitHubToken(token);
  } catch (error) {
    console.warn("hub_clients:github_unavailable", { message: toErrorMessage(error) });
    return reply(502, { error: "github_unavailable" });
  }
  if (claims === null) {
    return reply(401, { error: "invalid_token" });
  }

  const stage = readRunStage(claims);
  return stage === null ? notAllowed("run_not_allowed") : { claims, stage };
}

/** The body, if it is valid. The deployment name goes into a Convex API path. */
async function readBody(request: Request) {
  const [valid, body] = sureRequestBody(await request.json().catch(() => null));
  return valid &&
    body.app.length > 0 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.deployment) &&
    body.softwareVersion.length > 0 &&
    body.softwareVersion.length <= MAX_SOFTWARE_VERSION_LENGTH
    ? body
    : null;
}

/** The hub callback on the named deployment, or the reply that refuses the deployment. */
async function readRedirectUri(args: {
  token: string;
  teamId: string;
  deployment: string;
  stage: string;
}): Promise<string | Response> {
  try {
    const deployment = await readDeploymentInTeam(args);
    if (deployment === null) {
      return notAllowed("deployment_not_in_team");
    }
    if (!(await isDeploymentOfStage({ token: args.token, deployment, stage: args.stage }))) {
      return notAllowed("deployment_not_allowed_for_run");
    }
    // Outside US East the URL holds a region: https://<name>.<region>.convex.cloud.
    const siteUrl = deployment.deploymentUrl.replace(/\.convex\.cloud$/, ".convex.site");
    return `${siteUrl}${HUB_CALLBACK_PATH}`;
  } catch (error) {
    console.warn("hub_clients:convex_unavailable", { message: toErrorMessage(error) });
    return reply(502, { error: "convex_unavailable" });
  }
}

/**
Asks the hub for the client and passes its answer on. A logged line holds a status at most: the
hub's reply holds the secret.
*/
async function registerAtHub(args: {
  hub: { issuer: string; registrationKey: string };
  repositoryId: string;
  app: string;
  softwareVersion: string;
  redirectUri: string;
  stage: string;
}): Promise<Response> {
  const { hub, redirectUri, stage } = args;
  const tenantId = `gh-${args.repositoryId}`;
  const appHash = (await sha256Hex(args.app)).slice(0, 32);

  let response;
  try {
    response = await fetch(`${hub.issuer}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hub.registrationKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        software_id: `${tenantId}-${appHash}${stage === "prod" ? "" : "-preview"}`,
        software_version: args.softwareVersion,
        redirect_uris: [redirectUri],
        deployment_type: stage === "prod" ? "production" : "preview",
        client_name: stage,
        token_endpoint_auth_method: "client_secret_post",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    console.warn("hub_clients:hub_unavailable");
    return reply(502, { error: "hub_unavailable" });
  }
  if (response.status === 403) {
    return notAllowed("hub_refused");
  }

  const [valid, client] = sureHubClient(
    response.status === 201 ? await response.json().catch(() => null) : null,
  );
  if (!valid) {
    console.warn("hub_clients:hub_unavailable", { status: response.status });
    return reply(502, { error: "hub_unavailable" });
  }
  return reply(201, {
    issuer: hub.issuer,
    client_id: client.client_id,
    client_secret: client.client_secret,
    registration_access_token: client.registration_access_token,
    registration_client_uri: client.registration_client_uri,
    redirect_uri: redirectUri,
  });
}

/**
A new hub client for one deployment of a stranger's app, asked for by its GitHub Actions run with
GitHub's OIDC token. The run holds no Samebase key. Samebase builds the whole hub request, so the body
chooses only a name inside the repository's own namespace and a deployment that the checks allow.
The client's secret stays in this action's memory: it goes to the run and to nothing else.
*/
export const registerHubClient = httpAction(async (ctx, request) => {
  const hub = readHub();
  if (hub === null) {
    return reply(404, { error: "off" });
  }

  const run = await readRun(request);
  if (run instanceof Response) {
    return run;
  }
  const body = await readBody(request);
  if (body === null) {
    return reply(400, { error: "invalid_request" });
  }

  const admission = await ctx.runMutation(internal.hubClients.registration.admitRequest, {
    githubRepositoryDatabaseId: run.claims.repository_id,
    githubOwnerId: run.claims.repository_owner_id,
  });
  if (admission.status === "rate_limited") {
    return reply(429, { error: "rate_limited" });
  }
  if (admission.status === "refused") {
    return notAllowed(admission.reason);
  }

  const token = (
    await openSecret({
      sealed: admission.credential,
      aad: organizationProviderCredentialAad(admission.organizationId, "convex.auth.credential"),
    })
  ).trim();
  if (!token) {
    return notAllowed("convex_not_connected");
  }

  const redirectUri = await readRedirectUri({
    token,
    teamId: admission.teamId,
    deployment: body.deployment,
    stage: run.stage,
  });
  if (redirectUri instanceof Response) {
    return redirectUri;
  }

  return await registerAtHub({
    hub,
    repositoryId: run.claims.repository_id,
    app: body.app,
    softwareVersion: body.softwareVersion,
    redirectUri,
    stage: run.stage,
  });
});
