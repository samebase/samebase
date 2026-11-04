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
import { toErrorMessage } from "../jsonUtils";
import { sha256Hex } from "../mcp/tokens";
import { isLiveConnectedRepository } from "../repository/state";
import { readHub, readRepositoryByGitHubId } from "./tenantConnection";

const { literal, null: vNull, object, string, union } = v;

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
const GITHUB_OIDC_AUDIENCE = "samebase";
const REQUEST_TIMEOUT_MS = 10_000;
/**
The file at the root of the return address's origin that names the repository which controls the
host. Not under `/.well-known/`: RFC 8615 requires a registered name there.
*/
const VERIFICATION_PATH = "/samebase-verification.json";
/** The time limit of the whole verification request, the body included. */
const VERIFICATION_TIMEOUT_MS = 5_000;
/** The file holds one id. A larger body is not this file, and the read stops at this size. */
const MAX_VERIFICATION_BYTES = 4_096;
const MAX_REDIRECT_URI_LENGTH = 2_048;
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
  repository: sureString,
  actor_id: sureString,
  actor: sureString,
  sha: sureString,
});

const sureRequestBody = sureObject({
  app: sureString,
  redirectUri: sureString,
  softwareVersion: sureString,
});

/** The file's one member: the numeric GitHub repository id, as a JSON number or a string of digits. */
const sureVerificationFile = sureObject({
  repository: pure((value) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? good(String(value))
      : typeof value === "string" && /^[1-9][0-9]*$/.test(value)
        ? good(value)
        : bad("not a repository id" as const),
  ),
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
    reason: union(literal("repository_not_connected"), literal("owner_mismatch")),
  }),
  object({ status: literal("rate_limited") }),
  object({ status: literal("admitted") }),
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
Admits a verified token of a connected repository and counts the request. `githubRepositoryDatabaseId`
and `githubOwnerId` are numeric GitHub ids that the token carries, so a rename changes nothing, and a
transfer stops at the owner check until the new owner connects.
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
    return admitted ? ({ status: "admitted" } as const) : ({ status: "rate_limited" } as const);
  },
});

/**
What GitHub's token said about the run that asked for a client, kept with the hub's client ID. It
holds no secret.
*/
export const recordRegistration = internalMutation({
  args: {
    clientId: string(),
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    githubRepository: string(),
    githubActorId: string(),
    githubActorLogin: string(),
    commitSha: string(),
    stage: string(),
    app: string(),
    redirectUri: string(),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await ctx.db.insert("hubClientRegistrations", {
      clientId: args.clientId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerId: args.githubOwnerId,
      githubRepository: args.githubRepository,
      githubActorId: args.githubActorId,
      githubActorLogin: args.githubActorLogin,
      commitSha: args.commitSha,
      stage: args.stage,
      app: args.app,
      redirectUri: args.redirectUri,
    });
    return null;
  },
});

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

/**
The return address, if it is an absolute https URL on a DNS name, with no fragment and no user
info. An IP address or `localhost` is never a host that a file can prove. Any port and any path.
*/
function readRedirectUri(value: string) {
  if (value.length > MAX_REDIRECT_URI_LENGTH || value.includes("#")) {
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // The URL parser lowercases the host and writes an IPv4 address in dotted decimal, so a DNS name
  // is the one form whose last label starts with a letter.
  return url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    /^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(url.hostname) &&
    !url.hostname.endsWith(".localhost")
    ? url
    : null;
}

/** The body, if it is valid. */
async function readBody(request: Request) {
  const [valid, body] = sureRequestBody(await request.json().catch(() => null));
  if (
    !valid ||
    body.app.length === 0 ||
    body.softwareVersion.length === 0 ||
    body.softwareVersion.length > MAX_SOFTWARE_VERSION_LENGTH
  ) {
    return null;
  }
  const redirectUrl = readRedirectUri(body.redirectUri);
  return redirectUrl === null ? null : { ...body, redirectUrl };
}

/** The body as text, or null when it is larger than `MAX_VERIFICATION_BYTES`. It reads no further. */
async function readSmallBody(response: Response) {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    size += value.byteLength;
    if (size > MAX_VERIFICATION_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/**
Null when the origin of the return address serves `VERIFICATION_PATH` with `repositoryId`, else the
reason of the refusal. A redirect is never followed: the file must be on the host itself. The reason
never holds the body or the id that the file names.
*/
async function verifyHost(redirectUrl: URL, repositoryId: string) {
  let text;
  try {
    const response = await fetch(new URL(VERIFICATION_PATH, redirectUrl.origin), {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return "verification_file_missing";
    }
    text = await readSmallBody(response);
  } catch {
    return "host_unreachable";
  }
  let json: unknown = null;
  try {
    json = text === null ? null : JSON.parse(text);
  } catch {
    // Not JSON.
  }
  const [valid, file] = sureVerificationFile(json);
  if (!valid) {
    return "verification_file_invalid";
  }
  return file.repository === repositoryId ? null : "repository_mismatch";
}

/**
Asks the hub for the client. A logged line holds a status at most: the hub's reply holds the secret.
*/
async function registerAtHub(args: {
  hub: { issuer: string; registrationKey: string };
  repositoryId: string;
  app: string;
  softwareVersion: string;
  redirectUri: string;
  stage: string;
}) {
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
  return client;
}

/**
A new hub client for one deployment of a stranger's app, asked for by its GitHub Actions run with
GitHub's OIDC token. The run holds no Samebase key. Samebase builds the whole hub request, so the body
chooses only a name inside the repository's own namespace and a return address on a host that serves
the repository's id at `VERIFICATION_PATH`. The client's secret stays in this action's memory: it
goes to the run and to nothing else.
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

  const refusal = await verifyHost(body.redirectUrl, run.claims.repository_id);
  if (refusal !== null) {
    return notAllowed(refusal);
  }

  const client = await registerAtHub({
    hub,
    repositoryId: run.claims.repository_id,
    app: body.app,
    softwareVersion: body.softwareVersion,
    redirectUri: body.redirectUri,
    stage: run.stage,
  });
  if (client instanceof Response) {
    return client;
  }
  await ctx.runMutation(internal.hubClients.registration.recordRegistration, {
    clientId: client.client_id,
    githubRepositoryDatabaseId: run.claims.repository_id,
    githubOwnerId: run.claims.repository_owner_id,
    githubRepository: run.claims.repository,
    githubActorId: run.claims.actor_id,
    githubActorLogin: run.claims.actor,
    commitSha: run.claims.sha,
    stage: run.stage,
    app: body.app,
    redirectUri: body.redirectUri,
  });
  return reply(201, {
    issuer: hub.issuer,
    client_id: client.client_id,
    client_secret: client.client_secret,
    registration_access_token: client.registration_access_token,
    registration_client_uri: client.registration_client_uri,
    redirect_uri: body.redirectUri,
  });
});
