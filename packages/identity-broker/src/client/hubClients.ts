import { validate } from "convex-helpers/validators";
import { httpActionGeneric, type GenericActionCtx, type GenericDataModel } from "convex/server";
import { v } from "convex/values";
import { base64url, createLocalJWKSet, errors as joseErrors, jwtVerify } from "jose";
import type { ComponentApi } from "../component/_generated/component.js";
import { newClientCredentials, type RegistrationConfig } from "./registration.js";
import { sha256Hex } from "./subject.js";

// `POST /hub-clients`: a new client for one deployment of an app, with no account at the hub. The
// Bearer is the proof. A GitHub Actions run proves its repository with GitHub's OIDC token; a
// development server proves the app with the app's initial access token, which a production run
// got. The rows and the rules that read them are in src/component/hubClients.ts.

const { array, literal, number, object, string, union } = v;

type Ctx = GenericActionCtx<GenericDataModel>;

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
/** Stored on every client row. A commit hash or a version fits many times. */
const MAX_SOFTWARE_VERSION_LENGTH = 256;
/** The app's name is stored on every client and shown on the admin page. */
const MAX_APP_LENGTH = 64;
/**
 * The hosts of a development server's return address, as the redirect URI rule names them
 * (`isLoopbackHost` in protocol.ts). The URL parser writes an IPv6 host with its brackets.
 */
export const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Each check below allows unknown fields: GitHub and a host send more than these name.

const vRequestBody = object({ app: string(), redirectUri: string(), softwareVersion: string() });

/** The file's one field: the numeric GitHub repository id, as a string of digits or a JSON number. */
const vVerificationFile = object({ repository: union(string(), number()) });

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

// The GitHub Actions proof. Everything after `readRun` works on GitHub's ids, so a second proof
// would be a second module like this section, not a change to the rest.

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
/** The audience that `Convex.SharedHubClient` of @samebase/alchemy-convex asks GitHub for. */
const GITHUB_OIDC_AUDIENCE = "samebase";

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
  /** Seconds. It orders two proofs of one repository, so an older one cannot undo a newer one. */
  iat: number(),
});

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
        requiredClaims: ["exp", "iat"],
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

// The request and the host.

/**
 * The return address, if it is absolute, with no fragment and no user info, and either https on a DNS
 * name, which the verification file proves, or http on a loopback host, which only the initial access
 * token can prove: the hub cannot reach a development server. An IP address or `localhost` over
 * https is never a host that a file can prove. Any port and any path.
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

/** `POST /hub-clients` of a hub with `registration` in its config. */
export function hubClientsEndpoint(args: {
  component: ComponentApi;
  issuer: string;
  registration: RegistrationConfig;
}) {
  const { component, issuer, registration } = args;

  /** Whether the repository's apps are the hub's own, by its id in `ownRepositoryIds`. */
  function isOwnRepository(githubRepositoryDatabaseId: string) {
    return (registration.ownRepositoryIds() ?? "")
      .split(",")
      .some((id) => id.trim() === githubRepositoryDatabaseId);
  }

  /**
   * What the apps of a repository are: the hub's own, with every connector but a reserved one, or
   * third-party with the one connector `thirdPartyConnector`. An existing app keeps what it was made
   * as: a registration that says otherwise is refused with `app_taken`.
   */
  function trustOf(githubRepositoryDatabaseId: string) {
    return isOwnRepository(githubRepositoryDatabaseId)
      ? { firstParty: true as const }
      : { firstParty: false as const, connector: registration.thirdPartyConnector };
  }

  /**
   * Refuses a paused, blocked, or limited request, else null. It counts an admitted one in the
   * repository and owner windows. The pause stops third-party repositories only, so the hub's own
   * apps keep getting clients.
   */
  async function admit(
    ctx: Ctx,
    ids: { githubRepositoryDatabaseId: string; githubOwnerId: string },
  ) {
    if (registration.paused() && !isOwnRepository(ids.githubRepositoryDatabaseId)) {
      return notAllowed("paused");
    }
    const admission = await ctx.runMutation(component.hubClients.admit, {
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
    credentials: Awaited<ReturnType<typeof newClientCredentials>>,
    redirectUri: string,
  ) {
    return {
      issuer,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      registration_access_token: credentials.registrationAccessToken,
      registration_client_uri: credentials.registrationClientUri,
      redirect_uri: redirectUri,
      terms: registration.terms,
    };
  }

  /**
   * A client for a GitHub Actions run, with GitHub's OIDC token. A run of main also gets the app's
   * initial access token, which a development server of the team uses for its development client.
   */
  async function registerRun(ctx: Ctx, request: Request, githubToken: string) {
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

    const credentials = await newClientCredentials(issuer);
    // 32 random bytes in base64url, so the token has no dot and never looks like a JWT.
    const initialAccessToken =
      run.stage === "prod" ? base64url.encode(crypto.getRandomValues(new Uint8Array(32))) : null;
    const created = await ctx.runMutation(component.hubClients.createClient, {
      clientId: credentials.clientId,
      secretHash: credentials.secretHash,
      registrationTokenHash: credentials.registrationTokenHash,
      githubRepositoryDatabaseId: run.claims.repository_id,
      githubOwnerId: run.claims.repository_owner_id,
      githubRepository: run.claims.repository,
      githubActorId: run.claims.actor_id,
      githubActorLogin: run.claims.actor,
      commitSha: run.claims.sha,
      proofIssuedAt: run.claims.iat,
      deployment:
        initialAccessToken === null
          ? { type: "preview", stage: run.stage }
          : { type: "production", initialAccessTokenHash: await sha256Hex(initialAccessToken) },
      trust: trustOf(run.claims.repository_id),
      app: body.app,
      redirectUri: body.redirectUri,
      softwareVersion: body.softwareVersion,
    });
    if (!created.ok) {
      return created.reason === "new_owners"
        ? reply(429, { error: "rate_limited", window: "new_owners" })
        : notAllowed(created.reason);
    }
    return reply(201, {
      ...newClient(credentials, body.redirectUri),
      ...(initialAccessToken === null
        ? {}
        : { initial_access_token: initialAccessToken, repository: run.claims.repository_id }),
    });
  }

  /**
   * A development client, with the app's initial access token, which only a reader of the state of
   * the app's `prod` stage has. The repository and owner come from the token's row. A loopback
   * return address needs no verification file; an https one needs it, as for a run.
   */
  async function registerDevelopment(ctx: Ctx, request: Request, initialAccessToken: string) {
    const tokenHash = await sha256Hex(initialAccessToken);
    const token = await ctx.runQuery(component.hubClients.readInitialAccessToken, { tokenHash });
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

    const credentials = await newClientCredentials(issuer);
    const created = await ctx.runMutation(component.hubClients.createDevelopmentClient, {
      clientId: credentials.clientId,
      secretHash: credentials.secretHash,
      registrationTokenHash: credentials.registrationTokenHash,
      tokenHash,
      githubOwnerId: token.githubOwnerId,
      trust: trustOf(token.githubRepositoryDatabaseId),
      app: token.app,
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
   * The Bearer is the proof, told apart by its shape: two dots is a JWT, GitHub's OIDC token of a
   * GitHub Actions run, which is checked as such and refused when any check fails; no dot is the
   * app's initial access token, for a development client. The hub builds the whole client, so the
   * body chooses only a name inside the repository's own namespace and a return address. The
   * client's secret and registration access token stay in this action's memory: they go to the
   * caller and to nothing else.
   */
  return httpActionGeneric(async (ctx, request) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
    // A JWT has three parts; the initial access token is base64url, which has no dot.
    const parts = bearer?.split(".").length;
    if (bearer !== undefined && parts === 3) {
      return await registerRun(ctx, request, bearer);
    }
    if (bearer !== undefined && parts === 1) {
      return await registerDevelopment(ctx, request, bearer);
    }
    return reply(401, { error: "invalid_token" });
  });
}
