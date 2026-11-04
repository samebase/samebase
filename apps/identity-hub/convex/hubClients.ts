import { validate } from "convex-helpers/validators";
import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import { createLocalJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { httpAction, internalMutation, type MutationCtx } from "./_generated/server";
import { broker, isPaused, issuer } from "./broker";
import { APPS_CONNECTOR } from "./connectors";
import { isBlocked, sha256Hex } from "./moderation";

const { array, literal, number, object, string, union } = v;

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
/** The audience that `Convex.SharedHubClient` of @samebase/alchemy-convex asks GitHub for. */
const GITHUB_OIDC_AUDIENCE = "samebase";
const REQUEST_TIMEOUT_MS = 10_000;
/**
 * The file at the root of the return address's origin that names the repository which controls the
 * host. Not under `/.well-known/`: RFC 8615 requires a registered name there.
 */
const VERIFICATION_PATH = "/samebase-verification.json";
/** The time limit of the whole verification request, the body included. */
const VERIFICATION_TIMEOUT_MS = 5_000;
/** The file holds one id. A larger body is not this file, and the read stops at this size. */
const MAX_VERIFICATION_BYTES = 4_096;
const MAX_REDIRECT_URI_LENGTH = 2_048;
/** The broker stores the version on every client row. A commit hash or a version fits many times. */
const MAX_SOFTWARE_VERSION_LENGTH = 256;
/** The app's name is stored on every registration and shown on the admin page. */
const MAX_APP_LENGTH = 64;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;
/**
 * Requests per hour. A run asks only when it has no saved client: later deploys renew at the broker
 * directly. A new owner is one with no registration yet, and it counts once in its window.
 */
const RATE_LIMITS = { repository: 30, owner: 100, new_owners: 50 } as const;
/** The terms of the shared sign-in service, which the deploy log of a new client links to. */
const TERMS_URL = "https://samebase.com/terms";

// Each check below allows unknown fields: GitHub and a host send more than these name.

/** GitHub's key set. jose checks each key, so this checks only the shape that it takes. */
const vGitHubKeySet = object({ keys: array(object({ kty: string() })) });

/** `aud` is one exact string: jose alone also accepts a list that holds the audience. */
const vGitHubClaims = object({
  aud: literal(GITHUB_OIDC_AUDIENCE),
  event_name: string(),
  ref: string(),
  repository_id: string(),
  repository_owner_id: string(),
  repository: string(),
  actor_id: string(),
  actor: string(),
  sha: string(),
});

const vRequestBody = object({ app: string(), redirectUri: string(), softwareVersion: string() });

/** The file's one field: the numeric GitHub repository id, as a string of digits or a JSON number. */
const vVerificationFile = object({ repository: union(string(), number()) });

const vRateLimitWindow = union(literal("repository"), literal("owner"), literal("new_owners"));

const vAdmission = union(
  object({ status: literal("admitted") }),
  object({ status: literal("blocked") }),
  object({ status: literal("rate_limited"), window: vRateLimitWindow }),
);

const vCreation = union(
  object({ ok: literal(true) }),
  object({
    ok: literal(false),
    reason: union(
      literal("blocked"),
      literal("suspended"),
      literal("too_many_apps"),
      literal("too_many_clients"),
      literal("app_taken"),
    ),
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
  const keySet: unknown = response.ok ? await response.json() : null;
  if (!validate(vGitHubKeySet, keySet, { allowUnknownFields: true })) {
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
    return validate(vGitHubClaims, payload, { allowUnknownFields: true }) ? payload : null;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      return null;
    }
    throw error;
  }
}

/**
 * The one stage that a run may ask for, from claims that GitHub signs: `pr-<number>` for a pull
 * request, or `prod` for main. Every other event is refused, also Dependabot's `dynamic`.
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
    console.warn("hub_clients:github_unavailable", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return reply(502, { error: "github_unavailable" });
  }
  if (claims === null) {
    return reply(401, { error: "invalid_token" });
  }

  const stage = readRunStage(claims);
  return stage === null ? notAllowed("run_not_allowed") : { claims, stage };
}

/**
 * The return address, if it is an absolute https URL on a DNS name, with no fragment and no user
 * info. An IP address or `localhost` is never a host that a file can prove. Any port and any path.
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
  const body: unknown = await request.json().catch(() => null);
  if (
    !validate(vRequestBody, body, { allowUnknownFields: true }) ||
    body.app.length === 0 ||
    body.app.length > MAX_APP_LENGTH ||
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
  const bytes = new Uint8Array(MAX_VERIFICATION_BYTES);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return new TextDecoder().decode(bytes.subarray(0, size));
    }
    if (size + value.byteLength > MAX_VERIFICATION_BYTES) {
      await reader.cancel();
      return null;
    }
    bytes.set(value, size);
    size += value.byteLength;
  }
}

/**
 * Null when the origin of the return address serves `VERIFICATION_PATH` with `repositoryId`, else
 * the reason of the refusal. A redirect is never followed: the file must be on the host itself. The
 * reason never holds the body or the id that the file names.
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
  if (!validate(vVerificationFile, json, { allowUnknownFields: true })) {
    return "verification_file_invalid";
  }
  // A fraction, a negative number, or a number too large for JSON to keep fails here.
  const id = String(json.repository);
  if (!/^[1-9][0-9]*$/.test(id)) {
    return "verification_file_invalid";
  }
  return id === repositoryId ? null : "repository_mismatch";
}

/** The requests of `row` in its window at `now`: none once the window has ended. */
function countIn(row: Doc<"rateLimits"> | null, now: number) {
  return row !== null && row.startedAt + RATE_LIMIT_WINDOW_MS > now ? row.count : 0;
}

/** Counts one request in `row`'s window, or starts a new window. */
async function countRequest(
  ctx: MutationCtx,
  row: Doc<"rateLimits"> | null,
  first: WithoutSystemFields<Doc<"rateLimits">>,
  now: number,
) {
  if (row === null) {
    await ctx.db.insert("rateLimits", first);
    return;
  }
  await ctx.db.patch(
    "rateLimits",
    row._id,
    countIn(row, now) === 0 ? { startedAt: now, count: 1 } : { count: row.count + 1 },
  );
}

async function readRateLimit(ctx: MutationCtx, scope: "repository" | "owner", githubId: string) {
  return await ctx.db
    .query("rateLimits")
    .withIndex("by_scope_and_github_id", (q) => q.eq("scope", scope).eq("githubId", githubId))
    .unique();
}

/**
 * Refuses a blocked repository or owner, then counts the request in the hourly windows of the
 * repository, the owner, and, for an owner with no registration yet, all new owners. A refused
 * request counts nowhere. Runs before the verification file is fetched.
 */
export const admitRequest = internalMutation({
  args: { githubRepositoryDatabaseId: string(), githubOwnerId: string() },
  returns: vAdmission,
  handler: async (ctx, args) => {
    if (
      await isBlocked(ctx, {
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerId: args.githubOwnerId,
      })
    ) {
      return { status: "blocked" as const };
    }

    const now = Date.now();
    const repository = await readRateLimit(ctx, "repository", args.githubRepositoryDatabaseId);
    const owner = await readRateLimit(ctx, "owner", args.githubOwnerId);
    const newOwners = await ctx.db
      .query("rateLimits")
      .withIndex("by_scope_and_github_id", (q) => q.eq("scope", "new_owners").eq("githubId", ""))
      .unique();
    // The new-owners window that counts a request now: the running one, or one that starts now.
    const newOwnersWindow =
      newOwners !== null && countIn(newOwners, now) > 0 ? newOwners.startedAt : now;
    // An owner with no registration is counted once in each new-owners window.
    const newOwner =
      owner?.newOwnersWindowStartedAt !== newOwnersWindow &&
      (await ctx.db
        .query("registrations")
        .withIndex("by_github_owner_id", (q) => q.eq("githubOwnerId", args.githubOwnerId))
        .first()) === null;

    if (countIn(repository, now) >= RATE_LIMITS.repository) {
      return { status: "rate_limited" as const, window: "repository" as const };
    }
    if (countIn(owner, now) >= RATE_LIMITS.owner) {
      return { status: "rate_limited" as const, window: "owner" as const };
    }
    if (newOwner && countIn(newOwners, now) >= RATE_LIMITS.new_owners) {
      return { status: "rate_limited" as const, window: "new_owners" as const };
    }

    await countRequest(
      ctx,
      repository,
      {
        scope: "repository",
        githubId: args.githubRepositoryDatabaseId,
        startedAt: now,
        count: 1,
        newOwnersWindowStartedAt: null,
      },
      now,
    );
    const newOwnersWindowStartedAt = newOwner
      ? newOwnersWindow
      : (owner?.newOwnersWindowStartedAt ?? null);
    if (owner === null) {
      await ctx.db.insert("rateLimits", {
        scope: "owner",
        githubId: args.githubOwnerId,
        startedAt: now,
        count: 1,
        newOwnersWindowStartedAt,
      });
    } else {
      await ctx.db.patch("rateLimits", owner._id, {
        ...(countIn(owner, now) === 0 ? { startedAt: now, count: 1 } : { count: owner.count + 1 }),
        newOwnersWindowStartedAt,
      });
    }
    if (newOwner) {
      await countRequest(
        ctx,
        newOwners,
        {
          scope: "new_owners",
          githubId: "",
          startedAt: now,
          count: 1,
          newOwnersWindowStartedAt: null,
        },
        now,
      );
    }
    return { status: "admitted" as const };
  },
});

/**
 * Creates the client at the broker and records its registration, in one transaction. The blocks are
 * read again here, so a block set while the verification file was fetched still applies. The tenant
 * is `gh-<repository id>`, and the app is the repository's app of that name, with its previews in an
 * app of their own. The arguments hold the hashes of the secret and the token, never the values.
 */
export const createClient = internalMutation({
  args: {
    clientId: string(),
    secretHash: string(),
    registrationTokenHash: string(),
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    githubRepository: string(),
    githubActorId: string(),
    githubActorLogin: string(),
    commitSha: string(),
    stage: string(),
    app: string(),
    redirectUri: string(),
    softwareVersion: string(),
  },
  returns: vCreation,
  handler: async (ctx, args) => {
    if (
      await isBlocked(ctx, {
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerId: args.githubOwnerId,
      })
    ) {
      return { ok: false as const, reason: "blocked" as const };
    }

    const now = Date.now();
    const tenantId = `gh-${args.githubRepositoryDatabaseId}`;
    const production = args.stage === "prod";
    const appHash = (await sha256Hex(args.app)).slice(0, 32);
    const result = await ctx.runMutation(components.identityBroker.registration.register, {
      tenantId,
      ownerId: args.githubOwnerId,
      appId: `${tenantId}-${appHash}${production ? "" : "-preview"}`,
      connector: APPS_CONNECTOR,
      deploymentType: production ? "production" : "preview",
      clientId: args.clientId,
      secretHash: args.secretHash,
      registrationTokenHash: args.registrationTokenHash,
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUri: args.redirectUri,
      clientName: args.stage,
      softwareVersion: args.softwareVersion,
      now,
    });
    if (!result.ok) {
      return { ok: false as const, reason: result.error };
    }

    await ctx.db.insert("registrations", {
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
      registeredAt: now,
    });
    return { ok: true as const };
  },
});

/**
 * A new client for one deployment of an app, asked for by its GitHub Actions run with GitHub's OIDC
 * token. No Samebase account is needed. The hub builds the whole client, so the body chooses only a
 * name inside the repository's own namespace and a return address on a host that serves the
 * repository's id at `VERIFICATION_PATH`. The client's secret and registration access token stay in
 * this action's memory: they go to the run and to nothing else.
 */
export const registerHubClient = httpAction(async (ctx, request) => {
  if (isPaused()) {
    return notAllowed("paused");
  }

  const run = await readRun(request);
  if (run instanceof Response) {
    return run;
  }
  const body = await readBody(request);
  if (body === null) {
    return reply(400, { error: "invalid_request" });
  }

  const admission = await ctx.runMutation(internal.hubClients.admitRequest, {
    githubRepositoryDatabaseId: run.claims.repository_id,
    githubOwnerId: run.claims.repository_owner_id,
  });
  if (admission.status === "blocked") {
    return notAllowed("blocked");
  }
  if (admission.status === "rate_limited") {
    return reply(429, { error: "rate_limited", window: admission.window });
  }

  const refusal = await verifyHost(body.redirectUrl, run.claims.repository_id);
  if (refusal !== null) {
    return notAllowed(refusal);
  }

  const credentials = await broker.newClientCredentials();
  const created = await ctx.runMutation(internal.hubClients.createClient, {
    clientId: credentials.clientId,
    secretHash: credentials.secretHash,
    registrationTokenHash: credentials.registrationTokenHash,
    githubRepositoryDatabaseId: run.claims.repository_id,
    githubOwnerId: run.claims.repository_owner_id,
    githubRepository: run.claims.repository,
    githubActorId: run.claims.actor_id,
    githubActorLogin: run.claims.actor,
    commitSha: run.claims.sha,
    stage: run.stage,
    app: body.app,
    redirectUri: body.redirectUri,
    softwareVersion: body.softwareVersion,
  });
  if (!created.ok) {
    return notAllowed(created.reason);
  }
  return reply(201, {
    issuer,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    registration_access_token: credentials.registrationAccessToken,
    registration_client_uri: credentials.registrationClientUri,
    redirect_uri: body.redirectUri,
    terms: TERMS_URL,
  });
});
