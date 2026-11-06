import { validate } from "convex-helpers/validators";
import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import { base64url, createLocalJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  httpAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { broker, isPaused, issuer } from "./broker";
import { APPS_CONNECTOR } from "./connectors";
import { isBlocked, sha256Hex } from "./moderation";
import { OWN_REPOSITORY_IDS } from "./ownApps";

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
/**
 * The hosts of a laptop's return address, as the broker's redirect URI rule names them
 * (`isLoopbackHost` in packages/identity-broker/src/client/protocol.ts). The URL parser writes an
 * IPv6 host with its brackets.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

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

const vRefusal = union(
  literal("blocked"),
  literal("suspended"),
  literal("too_many_apps"),
  literal("too_many_clients"),
  literal("app_taken"),
);

const vCreation = union(
  object({ ok: literal(true) }),
  object({ ok: literal(false), reason: vRefusal }),
);

/**
 * The refusals of a laptop's client. `invalid_token`: the token's row was deleted or replaced, or
 * names another app or owner, after the request read it.
 */
const vDevelopmentCreation = union(
  object({ ok: literal(true) }),
  object({ ok: literal(false), reason: union(vRefusal, literal("invalid_token")) }),
);

/** The token row of a laptop's request, without its hash. */
const vInitialAccessToken = object({
  githubRepositoryDatabaseId: string(),
  githubOwnerId: string(),
  app: string(),
});

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

/** The verified run of a GitHub token, or the reply that refuses it. */
async function readRun(token: string) {
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
 * The return address, if it is absolute, with no fragment and no user info, and either https on a DNS
 * name, which the verification file proves, or http on a loopback host, which only the initial access
 * token can prove: the hub cannot reach a laptop. An IP address or `localhost` over https is never a
 * host that a file can prove. Any port and any path.
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
  if (url.username !== "" || url.password !== "") {
    return null;
  }
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
    return { url, loopback: true };
  }
  // The URL parser lowercases the host and writes an IPv4 address in dotted decimal, so a DNS name
  // is the one form whose last label starts with a letter.
  return url.protocol === "https:" &&
    /^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(url.hostname) &&
    !url.hostname.endsWith(".localhost")
    ? { url, loopback: false }
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
  const redirect = readRedirectUri(body.redirectUri);
  return redirect === null ? null : { ...body, redirect };
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

/** The broker's app of `app` in the repository's tenant: production, or previews and laptops. */
async function appIdOf(tenantId: string, app: string, production: boolean) {
  const appHash = (await sha256Hex(app)).slice(0, 32);
  return `${tenantId}-${appHash}${production ? "" : "-preview"}`;
}

/**
 * What the broker makes the apps of a repository: the hub's own, with every connector, for a
 * repository of `OWN_REPOSITORY_IDS`, else third-party with the one connector `APPS_CONNECTOR`.
 */
function trustOf(githubRepositoryDatabaseId: string) {
  return OWN_REPOSITORY_IDS.has(githubRepositoryDatabaseId)
    ? { firstParty: true as const }
    : { firstParty: false as const, connector: APPS_CONNECTOR };
}

/**
 * Creates the client of a GitHub Actions run at the broker and records its registration, in one
 * transaction. The blocks are read again here, so a block set while the verification file was fetched
 * still applies. The tenant is `gh-<repository id>`, and the app is the repository's app of that name,
 * with its previews in an app of their own. A production client also replaces the app's initial
 * access token. A run whose owner is not the owner of a token row of the repository deletes that row,
 * so the old token of a transferred repository stops. The arguments hold the hashes of the secret and
 * the tokens, never the values.
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
    deployment: union(
      object({ type: literal("production"), initialAccessTokenHash: string() }),
      object({ type: literal("preview"), stage: string() }),
    ),
    app: string(),
    redirectUri: string(),
    softwareVersion: string(),
  },
  returns: vCreation,
  handler: async (ctx, args) => {
    // One row per app name of the repository, so a few rows.
    const tokens = await ctx.db
      .query("initialAccessTokens")
      .withIndex("by_repository_and_app", (q) =>
        q.eq("githubRepositoryDatabaseId", args.githubRepositoryDatabaseId),
      )
      .collect();
    for (const token of tokens) {
      if (token.githubOwnerId !== args.githubOwnerId) {
        await ctx.db.delete("initialAccessTokens", token._id);
      }
    }

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
    const production = args.deployment.type === "production";
    const stage = args.deployment.type === "production" ? "prod" : args.deployment.stage;
    const result = await ctx.runMutation(components.identityBroker.registration.register, {
      tenantId,
      ownerId: args.githubOwnerId,
      appId: await appIdOf(tenantId, args.app, production),
      trust: trustOf(args.githubRepositoryDatabaseId),
      deploymentType: args.deployment.type,
      clientId: args.clientId,
      secretHash: args.secretHash,
      registrationTokenHash: args.registrationTokenHash,
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUri: args.redirectUri,
      clientName: stage,
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
      proof: {
        kind: "github",
        githubActorId: args.githubActorId,
        githubActorLogin: args.githubActorLogin,
        commitSha: args.commitSha,
      },
      stage,
      app: args.app,
      redirectUri: args.redirectUri,
      registeredAt: now,
    });
    if (args.deployment.type === "production") {
      const previous = tokens.find(
        (token) => token.app === args.app && token.githubOwnerId === args.githubOwnerId,
      );
      if (previous !== undefined) {
        await ctx.db.delete("initialAccessTokens", previous._id);
      }
      await ctx.db.insert("initialAccessTokens", {
        tokenHash: args.deployment.initialAccessTokenHash,
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerId: args.githubOwnerId,
        githubRepository: args.githubRepository,
        app: args.app,
        issuedAt: now,
        productionClientId: args.clientId,
      });
    }
    return { ok: true as const };
  },
});

/** The row of an initial access token, or null when no row has its hash. */
export const readInitialAccessToken = internalQuery({
  args: { tokenHash: string() },
  returns: union(vInitialAccessToken, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("initialAccessTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    return row === null
      ? null
      : {
          githubRepositoryDatabaseId: row.githubRepositoryDatabaseId,
          githubOwnerId: row.githubOwnerId,
          app: row.app,
        };
  },
});

/**
 * Creates a laptop's development client of an app at the broker and records its registration, in
 * one transaction. The token's row is read again here, so a token replaced or deleted while the
 * verification file was fetched, or a row that names another app or owner, refuses the request; the
 * blocks are read again too. The client is in the app's preview app, with a removal date. No owner
 * goes to the broker: it checks the tenant's recorded owner and keeps it, so only a GitHub run changes
 * a tenant's owner.
 */
export const createDevelopmentClient = internalMutation({
  args: {
    tokenHash: string(),
    githubOwnerId: string(),
    app: string(),
    clientId: string(),
    secretHash: string(),
    registrationTokenHash: string(),
    redirectUri: string(),
    softwareVersion: string(),
  },
  returns: vDevelopmentCreation,
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("initialAccessTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (token === null || token.app !== args.app || token.githubOwnerId !== args.githubOwnerId) {
      return { ok: false as const, reason: "invalid_token" as const };
    }
    if (
      await isBlocked(ctx, {
        githubRepositoryDatabaseId: token.githubRepositoryDatabaseId,
        githubOwnerId: token.githubOwnerId,
      })
    ) {
      return { ok: false as const, reason: "blocked" as const };
    }

    const now = Date.now();
    const tenantId = `gh-${token.githubRepositoryDatabaseId}`;
    const result = await ctx.runMutation(components.identityBroker.registration.register, {
      tenantId,
      appId: await appIdOf(tenantId, token.app, false),
      trust: trustOf(token.githubRepositoryDatabaseId),
      deploymentType: "development",
      clientId: args.clientId,
      secretHash: args.secretHash,
      registrationTokenHash: args.registrationTokenHash,
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUri: args.redirectUri,
      clientName: "development",
      softwareVersion: args.softwareVersion,
      now,
    });
    if (!result.ok) {
      return { ok: false as const, reason: result.error };
    }

    await ctx.db.insert("registrations", {
      clientId: args.clientId,
      githubRepositoryDatabaseId: token.githubRepositoryDatabaseId,
      githubOwnerId: token.githubOwnerId,
      githubRepository: token.githubRepository,
      proof: { kind: "initial_access_token", issuedAt: token.issuedAt },
      stage: "development",
      app: token.app,
      redirectUri: args.redirectUri,
      registeredAt: now,
    });
    return { ok: true as const };
  },
});

/**
 * Refuses a paused, blocked, or limited request, else null. It counts an admitted one. The pause
 * (`THIRD_PARTY_PAUSED`) stops third-party repositories only, so the hub's own apps keep getting
 * clients.
 */
async function admit(
  ctx: ActionCtx,
  ids: { githubRepositoryDatabaseId: string; githubOwnerId: string },
) {
  if (isPaused() && !OWN_REPOSITORY_IDS.has(ids.githubRepositoryDatabaseId)) {
    return notAllowed("paused");
  }
  const admission = await ctx.runMutation(internal.hubClients.admitRequest, {
    githubRepositoryDatabaseId: ids.githubRepositoryDatabaseId,
    githubOwnerId: ids.githubOwnerId,
  });
  if (admission.status === "blocked") {
    return notAllowed("blocked");
  }
  if (admission.status === "rate_limited") {
    return reply(429, { error: "rate_limited", window: admission.window });
  }
  return null;
}

/** The 201 answer: the client, its secret, and its RFC 7592 token, which go to nothing else. */
function newClient(
  credentials: Awaited<ReturnType<typeof broker.newClientCredentials>>,
  redirectUri: string,
) {
  return {
    issuer,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    registration_access_token: credentials.registrationAccessToken,
    registration_client_uri: credentials.registrationClientUri,
    redirect_uri: redirectUri,
    terms: TERMS_URL,
  };
}

/**
 * A client for a GitHub Actions run, with GitHub's OIDC token. A run of main also gets the app's
 * initial access token, which a laptop of the team uses for its development client.
 */
async function registerRun(ctx: ActionCtx, request: Request, githubToken: string) {
  const run = await readRun(githubToken);
  if (run instanceof Response) {
    return run;
  }
  const body = await readBody(request);
  if (body === null || body.redirect.loopback) {
    return reply(400, { error: "invalid_request" });
  }

  const refused = await admit(ctx, {
    githubRepositoryDatabaseId: run.claims.repository_id,
    githubOwnerId: run.claims.repository_owner_id,
  });
  if (refused !== null) {
    return refused;
  }
  const refusal = await verifyHost(body.redirect.url, run.claims.repository_id);
  if (refusal !== null) {
    return notAllowed(refusal);
  }

  const credentials = await broker.newClientCredentials();
  // 32 random bytes in base64url, so the token has no dot and never looks like a JWT.
  const initialAccessToken =
    run.stage === "prod" ? base64url.encode(crypto.getRandomValues(new Uint8Array(32))) : null;
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
    deployment:
      initialAccessToken === null
        ? { type: "preview", stage: run.stage }
        : { type: "production", initialAccessTokenHash: await sha256Hex(initialAccessToken) },
    app: body.app,
    redirectUri: body.redirectUri,
    softwareVersion: body.softwareVersion,
  });
  if (!created.ok) {
    return notAllowed(created.reason);
  }
  return reply(201, {
    ...newClient(credentials, body.redirectUri),
    ...(initialAccessToken === null
      ? {}
      : { initial_access_token: initialAccessToken, repository: run.claims.repository_id }),
  });
}

/**
 * A development client for a laptop, with the app's initial access token, which only a reader of the
 * state of the app's `prod` stage has. The repository and owner come from the token's row. A loopback
 * return address needs no verification file; an https one needs it, as for a run.
 */
async function registerLaptop(ctx: ActionCtx, request: Request, initialAccessToken: string) {
  const tokenHash = await sha256Hex(initialAccessToken);
  const token = await ctx.runQuery(internal.hubClients.readInitialAccessToken, { tokenHash });
  if (token === null) {
    return reply(401, { error: "invalid_token" });
  }
  const body = await readBody(request);
  if (body === null) {
    return reply(400, { error: "invalid_request" });
  }
  if (body.app !== token.app) {
    return notAllowed("app_mismatch");
  }

  const refused = await admit(ctx, {
    githubRepositoryDatabaseId: token.githubRepositoryDatabaseId,
    githubOwnerId: token.githubOwnerId,
  });
  if (refused !== null) {
    return refused;
  }
  if (!body.redirect.loopback) {
    const refusal = await verifyHost(body.redirect.url, token.githubRepositoryDatabaseId);
    if (refusal !== null) {
      return notAllowed(refusal);
    }
  }

  const credentials = await broker.newClientCredentials();
  const created = await ctx.runMutation(internal.hubClients.createDevelopmentClient, {
    tokenHash,
    githubOwnerId: token.githubOwnerId,
    app: token.app,
    clientId: credentials.clientId,
    secretHash: credentials.secretHash,
    registrationTokenHash: credentials.registrationTokenHash,
    redirectUri: body.redirectUri,
    softwareVersion: body.softwareVersion,
  });
  if (!created.ok) {
    return created.reason === "invalid_token"
      ? reply(401, { error: "invalid_token" })
      : notAllowed(created.reason);
  }
  return reply(201, newClient(credentials, body.redirectUri));
}

/**
 * A new client for one deployment of an app. No Samebase account is needed. The Bearer is the proof,
 * told apart by its shape: two dots is a JWT, GitHub's OIDC token of a GitHub Actions run, which is
 * checked as such and refused when any check fails; no dot is the app's initial access token, for a
 * laptop. The hub builds the whole client, so the body chooses only a name inside the repository's
 * own namespace and a return address. The client's secret and registration access token stay in this
 * action's memory: they go to the caller and to nothing else.
 */
export const registerHubClient = httpAction(async (ctx, request) => {
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  // A JWT has three parts; the initial access token is base64url, which has no dot.
  const parts = bearer?.split(".").length;
  if (bearer !== undefined && parts === 3) {
    return await registerRun(ctx, request, bearer);
  }
  if (bearer !== undefined && parts === 1) {
    return await registerLaptop(ctx, request, bearer);
  }
  return reply(401, { error: "invalid_token" });
});
