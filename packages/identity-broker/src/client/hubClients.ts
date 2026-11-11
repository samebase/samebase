import { validate } from "convex-helpers/validators";
import { httpActionGeneric, type GenericActionCtx, type GenericDataModel } from "convex/server";
import { v } from "convex/values";
import { base64url, createLocalJWKSet, errors as joseErrors, jwtVerify } from "jose";
import type { ComponentApi } from "../component/_generated/component.js";
import { usableNames } from "../component/connectorRule.js";
import { logHubEvent } from "./hubEvents.js";
import { evaluate, type Registration } from "./policy.js";
import {
  clientInformation,
  insufficientScope,
  invalidToken,
  newClientCredentials,
  noToken,
  type RegistrationConfig,
} from "./registration.js";
import { json } from "./responses.js";
import { sha256Hex } from "./subject.js";

// `POST /register`, the client registration endpoint of RFC 7591: a new client for one deployment
// of an app, with no account at the hub. The endpoint is protected (RFC 7591 appendix A.1.2): the
// Bearer is the initial access token, and it is the proof. A GitHub Actions run proves its
// repository with GitHub's OIDC token; a development server proves the app with the app's own
// initial access token, which a production run got. The hub's policy decides what the registration
// may enroll in. The rows and the rules that read them are in src/component/hubClients.ts.

const { array, literal, number, object, optional, string, union } = v;

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
/** The return addresses of one client: a handler per flow of the app, with room to spare. */
const MAX_REDIRECT_URIS = 8;
/** Stored on every client row. A commit hash or a version fits many times. */
const MAX_SOFTWARE_VERSION_LENGTH = 256;
/** The app's name is stored on every client and shown on the admin page. */
const MAX_APP_LENGTH = 64;
/**
 * The hosts of a development server's return address, as the redirect URI rule names them
 * (`isLoopbackHost` in protocol.ts). The URL parser writes an IPv6 host with its brackets.
 */
export const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A connector name as a registration may send it. */
const CONNECTOR_NAME = /^[a-z0-9-]{1,64}$/;
/** The app of a registration without `software_id`. */
const DEFAULT_APP = "app";
/** The full form of `software_id`, `<tenant id>/<app name>`, whose tenant is a repository's. */
const FULL_SOFTWARE_ID = /^gh-[1-9][0-9]*\//;

// Each check below allows unknown fields: GitHub and a host send more than these name.

/**
 * The client metadata of a registration request that the hub reads (RFC 7591 section 2), but
 * `redirect_uris`, which has its own error. Any other member is ignored, as that section requires,
 * but the ones in `UNSUPPORTED_MEMBERS`.
 */
const vRequestBody = object({
  /**
   * The app: its name alone, or `<tenant id>/<app name>`. Absent: `DEFAULT_APP`. The same for each
   * deployment of the app.
   */
  software_id: optional(string()),
  /** Absent: `unknown`. */
  software_version: optional(string()),
  /**
   * The enrollment, the hub's own member: at least one connector name. Duplicates collapse. Absent:
   * every connector that this registration may enroll in.
   */
  connectors: optional(array(string())),
  /** Absent: `client_secret_basic`, the default of RFC 7591 section 2. */
  token_endpoint_auth_method: optional(
    union(literal("client_secret_post"), literal("client_secret_basic")),
  ),
  /** The hub answers its own values: a client asks for nothing here that the hub does not have. */
  grant_types: optional(array(union(literal("authorization_code"), literal("refresh_token")))),
  response_types: optional(array(literal("code"))),
  // The one value of each that the hub has (OpenID Connect Registration section 2).
  application_type: optional(literal("web")),
  subject_type: optional(literal("public")),
  id_token_signed_response_alg: optional(literal("RS256")),
});

/** The return addresses: one to `MAX_REDIRECT_URIS`. Duplicates collapse; the order does not matter. */
const vRedirectUris = object({ redirect_uris: array(string()) });

/**
 * Members of OpenID Connect Registration that the hub cannot honor, so a request with one is refused
 * rather than given a client that ignores it. Any member with `_encrypted_response_` or
 * `_encryption_` in its name is one too.
 */
const UNSUPPORTED_MEMBERS = new Set([
  "sector_identifier_uri",
  "userinfo_signed_response_alg",
  "request_object_signing_alg",
]);

/** The file's one field: the numeric GitHub repository id, as a string of digits or a JSON number. */
const vVerificationFile = object({ repository: union(string(), number()) });

/**
 * A JSON refusal: `error`, with a fixed sentence as `error_description` that never quotes the
 * request. `reason`, `allowed`, and `window` are the hub's own members.
 */
function refusal(
  status: number,
  error: string,
  description: string,
  more: { reason?: string; allowed?: string[]; window?: string } = {},
): Response {
  return json({ error, error_description: description, ...more }, status);
}

/** A registration error of RFC 7591 section 3.2.2. */
function invalid(
  error: "invalid_redirect_uri" | "invalid_client_metadata",
  description: string,
  more: { reason?: string; allowed?: string[] } = {},
): Response {
  return refusal(400, error, description, more);
}

/** The sentence of each refusal of a verification file. */
const VERIFICATION_REFUSALS = {
  verification_file_missing: "A site of redirect_uris does not serve its verification file.",
  host_unreachable: "A site of redirect_uris cannot be reached.",
  verification_file_invalid:
    "A site of redirect_uris serves a verification file that is not valid.",
  repository_mismatch: "A site of redirect_uris serves a verification file of another repository.",
} as const;

/** A site of the return addresses fails its verification file. */
const unverifiedHost = (reason: keyof typeof VERIFICATION_REFUSALS) =>
  invalid("invalid_redirect_uri", VERIFICATION_REFUSALS[reason], { reason });

/** The sentence of each rule that refuses a good token. */
const DENIALS = {
  run_not_allowed: "Only a pull request or a run of main may register a client.",
  paused: "Registration is paused for this repository.",
  blocked: "This repository or its owner is blocked.",
  stale_proof: "A newer token of this repository has registered a client.",
  app_mismatch: "The initial access token is for another app.",
  suspended: "This repository is suspended.",
  too_many_apps: "This repository has the most apps it may have.",
  too_many_clients: "This app has the most clients it may have.",
  app_taken: "This app belongs to another repository.",
} as const;

/** The answer to a good token whose holder may not register: the rule that refused it. */
function denied(reason: keyof typeof DENIALS): Response {
  return insufficientScope(DENIALS[reason], { reason });
}

/** The answer when the repository, its owner, or all new owners used their hourly registrations. */
const rateLimited = (window: string) =>
  refusal(429, "rate_limited", "The hourly limit of registrations is reached.", { window });

/** The connectors are not ones this registration may enroll in, with the names that are. */
const invalidConnectors = (allowed: string[]) =>
  invalid(
    "invalid_client_metadata",
    "The connectors are not ones that this registration may enroll in.",
    { reason: "invalid_connectors", allowed },
  );

/** The body of every JSON refusal of this endpoint. */
const vRefusal = object({ error: string(), reason: optional(string()) });

/**
 * The answer to a registration with `facts`, after its `hub_event` line. A refusal's reason is the
 * rule that a 403 names, else its error. The body of a 201 holds the client's secrets, so it is not
 * read.
 */
async function logged(facts: Registration, response: Response) {
  if (response.status === 201) {
    logHubEvent({ event: "registration", facts, connector: null, reason: null });
    return response;
  }
  const body: unknown = await response.clone().json();
  logHubEvent({
    event: "registration_refused",
    facts,
    connector: null,
    reason: validate(vRefusal, body, { allowUnknownFields: true })
      ? (body.reason ?? body.error)
      : String(response.status),
  });
  return response;
}

// The GitHub Actions proof. Everything after `readRun` works on GitHub's ids, so a second proof
// would be a second module like this section, not a change to the rest.

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;

/** GitHub's key set. jose checks each key, so this checks only the shape that it takes. */
const vGitHubKeySet = object({ keys: array(object({ kty: string() })) });

/**
 * `aud` is one string, the hub's issuer: jose alone also accepts a list that holds the audience,
 * and it has already checked the value. So a token that a deploy made for one hub is no use at
 * another hub, also when that hub's operator replays it.
 */
const vGitHubClaims = object({
  aud: string(),
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

/**
 * The claims of a good token for `audience`, or null for a bad one. It throws when GitHub cannot be
 * reached.
 */
async function verifyGitHubToken(token: string, audience: string) {
  try {
    const { payload } = await jwtVerify(
      token,
      async (header, input) => createLocalJWKSet(await readGitHubKeySet())(header, input),
      {
        algorithms: ["RS256"],
        audience,
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

/** The verified run of a GitHub token for `audience`, or the reply that refuses it. */
async function readRun(token: string, audience: string) {
  let claims;
  try {
    claims = await verifyGitHubToken(token, audience);
  } catch (error) {
    console.warn("hub_clients:github_unavailable", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return refusal(502, "github_unavailable", "GitHub's signing keys cannot be read.");
  }
  if (claims === null) {
    return invalidToken();
  }

  const stage = readRunStage(claims);
  return stage === null ? denied("run_not_allowed") : { claims, stage };
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

/**
 * The client metadata of the body, or the answer that refuses it: the app's name, from a
 * `software_id` whose full form must name `repositoryId`, the proof's repository; `redirectUris`
 * sorted and unique, each parsed, with `loopback` when any of them is a loopback address. The
 * enrollment it names is checked by `admit`, against the policy.
 */
async function readBody(request: Request, repositoryId: string) {
  const body: unknown = await request.json().catch(() => null);
  if (!validate(vRequestBody, body, { allowUnknownFields: true })) {
    return invalid(
      "invalid_client_metadata",
      "The body is not a JSON object of valid client metadata.",
    );
  }
  if (
    Object.keys(body).some(
      (name) =>
        UNSUPPORTED_MEMBERS.has(name) ||
        name.includes("_encrypted_response_") ||
        name.includes("_encryption_"),
    )
  ) {
    return invalid(
      "invalid_client_metadata",
      "The hub supports only web clients with public subjects and RS256, without encryption.",
    );
  }
  const softwareId = body.software_id ?? DEFAULT_APP;
  const full = FULL_SOFTWARE_ID.test(softwareId);
  if (full && !softwareId.startsWith(`gh-${repositoryId}/`)) {
    return invalid(
      "invalid_client_metadata",
      "The tenant of software_id is not the repository of the token.",
    );
  }
  const app = full ? softwareId.slice(softwareId.indexOf("/") + 1) : softwareId;
  if (app.length === 0 || app.length > MAX_APP_LENGTH) {
    return invalid("invalid_client_metadata", "The app name of software_id is 1 to 64 characters.");
  }
  const softwareVersion = body.software_version ?? "unknown";
  if (softwareVersion.length === 0 || softwareVersion.length > MAX_SOFTWARE_VERSION_LENGTH) {
    return invalid("invalid_client_metadata", "software_version is 1 to 256 characters.");
  }
  if (!validate(vRedirectUris, body, { allowUnknownFields: true })) {
    return invalid("invalid_redirect_uri", "redirect_uris is a list of 1 to 8 URIs.");
  }
  const redirectUris = [...new Set(body.redirect_uris)].sort();
  if (redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    return invalid("invalid_redirect_uri", "redirect_uris is a list of 1 to 8 URIs.");
  }
  const redirects = redirectUris.map(readRedirectUri);
  const parsed = redirects.filter((redirect) => redirect !== null);
  if (parsed.length !== redirects.length) {
    return invalid(
      "invalid_redirect_uri",
      "A redirect URI is https on a DNS name, or http on a loopback host for a development client, with no fragment and no user info.",
    );
  }
  return {
    app,
    softwareVersion,
    connectors: body.connectors,
    tokenEndpointAuthMethod: body.token_endpoint_auth_method ?? ("client_secret_basic" as const),
    redirectUris,
    /** The distinct origins of the https addresses, each of which must serve the verification file. */
    origins: [...new Set(parsed.filter((r) => !r.loopback).map((r) => r.url.origin))],
    loopback: parsed.some((redirect) => redirect.loopback),
  };
}

/**
 * The enrollment a body names, sorted and unique: at least one name of `[a-z0-9-]{1,64}`, each one
 * of `allowed`. Absent: all of `allowed`. Null for any other set, also an empty `allowed`.
 */
function readEnrollment(connectors: string[] | undefined, allowed: string[]) {
  const names = [...new Set(connectors ?? allowed)].sort();
  return names.length > 0 &&
    names.every((name) => CONNECTOR_NAME.test(name) && allowed.includes(name))
    ? names
    : null;
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
 * Null when `origin` serves `VERIFICATION_PATH` with `repositoryId`, else the reason of the refusal.
 * A redirect is never followed: the file must be on the host itself. The reason never holds the body
 * or the id that the file names.
 */
async function verifyHost(origin: string, repositoryId: string) {
  let text;
  try {
    const response = await fetch(new URL(VERIFICATION_PATH, origin), {
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

/** Null when every origin serves the file with `repositoryId`, else the first refusal, in order. */
async function verifyHosts(origins: string[], repositoryId: string) {
  for (const origin of origins) {
    const refusal = await verifyHost(origin, repositoryId);
    if (refusal !== null) {
      return refusal;
    }
  }
  return null;
}

/** `POST /register` of a hub with `registration` in its config. */
export function hubClientsEndpoint(args: {
  component: ComponentApi;
  issuer: string;
  registration: RegistrationConfig;
  /** The names of the hub's connectors, which an enrollment may name. */
  connectors: string[];
  /** The hub has API resources, so a client gets refresh tokens. */
  refreshTokens: boolean;
}) {
  const { component, issuer, registration } = args;

  /**
   * The enrollment of an admitted request, with the hub's connectors that the policy gives it, or
   * the answer that refuses it: a paused policy, a set that is empty, malformed, or outside the
   * hub's connectors, the policy's, and the repository's grants (with the names allowed), a block, or a
   * limit. A failed policy refuses with 503 and writes nothing. It counts an admitted request in the
   * repository and owner windows; a refused one counts nowhere.
   */
  async function admit(ctx: Ctx, facts: Registration, connectors: string[] | undefined) {
    const policy = evaluate(registration.policy, facts);
    if (policy === null) {
      return refusal(503, "temporarily_unavailable", "The hub's policy failed.");
    }
    if (policy.paused) {
      return denied("paused");
    }
    // What the policy gives, and what the admin granted the repository for the owner of this proof. The
    // creating mutation reads the grants again.
    const granted = await ctx.runQuery(component.connectorGrants.forRegistration, {
      githubRepositoryDatabaseId: facts.repositoryId,
      githubOwnerId: facts.ownerId,
    });
    // The one rule (`usableNames`), over the hub's configured connectors: the policy's alone for the
    // mutation, which reads the grants again, and with the grants for this request's answer.
    const rule = {
      requested: args.connectors,
      enrollment: args.connectors,
      configured: args.connectors,
    };
    const policyConnectors = usableNames({ ...rule, policy: policy.connectors, granted: [] });
    const allowed = usableNames({ ...rule, policy: policy.connectors, granted }).sort();
    const enrollment = readEnrollment(connectors, allowed);
    if (enrollment === null) {
      return invalidConnectors(allowed);
    }
    const admission = await ctx.runMutation(component.hubClients.admit, {
      githubRepositoryDatabaseId: facts.repositoryId,
      githubOwnerId: facts.ownerId,
    });
    if (admission.status === "blocked") {
      return denied("blocked");
    }
    if (admission.status === "rate_limited") {
      return rateLimited(admission.window);
    }
    return { enrollment, policyConnectors };
  }

  /** A grant went away while the host checked: the creating mutation's allowed names. */
  const grantRevoked = (allowed: string[]) =>
    invalidConnectors(allowed.filter((name) => args.connectors.includes(name)));

  /**
   * The 201 answer (RFC 7591 section 3.2.1): the client's registered metadata, its secret, and its
   * RFC 7592 token, which go to nothing else. `issuer` and `terms` are the hub's own members.
   */
  function newClient(
    credentials: Awaited<ReturnType<typeof newClientCredentials>>,
    client: Omit<Parameters<typeof clientInformation>[0], "issuer" | "refreshTokens">,
  ) {
    return {
      ...clientInformation({ ...client, issuer, refreshTokens: args.refreshTokens }),
      client_secret: credentials.clientSecret,
      registration_access_token: credentials.registrationAccessToken,
      issuer,
      terms: registration.terms,
    };
  }

  /**
   * A client for a GitHub Actions run, with GitHub's OIDC token. A run of main also gets the app's
   * initial access token, which a development server of the team uses for its development client.
   */
  async function registerRun(ctx: Ctx, request: Request, githubToken: string) {
    const run = await readRun(githubToken, issuer);
    if (run instanceof Response) {
      return run;
    }
    const body = await readBody(request, run.claims.repository_id);
    if (body instanceof Response) {
      return body;
    }
    // A run's client serves no loopback address: every address is on a verified host.
    if (body.loopback) {
      return invalid(
        "invalid_redirect_uri",
        "A GitHub Actions run cannot register a loopback redirect URI.",
      );
    }

    const facts: Registration = {
      repositoryId: run.claims.repository_id,
      repository: run.claims.repository,
      ownerId: run.claims.repository_owner_id,
      app: body.app,
      deploymentType: run.stage === "prod" ? "production" : "preview",
      redirectUris: body.redirectUris,
      proof: "github-actions",
    };
    const admitted = await admit(ctx, facts, body.connectors);
    if (admitted instanceof Response) {
      return await logged(facts, admitted);
    }
    const { enrollment, policyConnectors } = admitted;
    const unverified = await verifyHosts(body.origins, run.claims.repository_id);
    if (unverified !== null) {
      return await logged(facts, unverifiedHost(unverified));
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
      connectors: enrollment,
      policyConnectors,
      configuredConnectors: args.connectors,
      app: body.app,
      redirectUris: body.redirectUris,
      softwareVersion: body.softwareVersion,
      tokenEndpointAuthMethod: body.tokenEndpointAuthMethod,
    });
    if (!created.ok) {
      if (created.reason === "invalid_connectors") {
        return await logged(facts, grantRevoked(created.allowed));
      }
      return await logged(
        facts,
        created.reason === "new_owners" ? rateLimited("new_owners") : denied(created.reason),
      );
    }
    return await logged(
      facts,
      json(
        {
          ...newClient(credentials, {
            clientId: credentials.clientId,
            createdAt: created.createdAt,
            redirectUris: body.redirectUris,
            clientName: created.clientName,
            tenantId: created.tenantId,
            app: body.app,
            softwareVersion: body.softwareVersion,
            tokenEndpointAuthMethod: body.tokenEndpointAuthMethod,
            connectors: enrollment,
          }),
          ...(initialAccessToken === null
            ? {}
            : { initial_access_token: initialAccessToken, repository: run.claims.repository_id }),
        },
        201,
      ),
    );
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
      return invalidToken();
    }
    const body = await readBody(request, token.githubRepositoryDatabaseId);
    if (body instanceof Response) {
      return body;
    }
    // The app's name: `software_id` in either form names it.
    if (body.app !== token.app) {
      return denied("app_mismatch");
    }

    const facts: Registration = {
      repositoryId: token.githubRepositoryDatabaseId,
      repository: token.githubRepository,
      ownerId: token.githubOwnerId,
      app: token.app,
      deploymentType: "development",
      redirectUris: body.redirectUris,
      proof: "initial-access-token",
    };
    const admitted = await admit(ctx, facts, body.connectors);
    if (admitted instanceof Response) {
      return await logged(facts, admitted);
    }
    const { enrollment, policyConnectors } = admitted;
    // A loopback address needs no file; each https origin does.
    const unverified = await verifyHosts(body.origins, token.githubRepositoryDatabaseId);
    if (unverified !== null) {
      return await logged(facts, unverifiedHost(unverified));
    }

    const credentials = await newClientCredentials(issuer);
    const created = await ctx.runMutation(component.hubClients.createDevelopmentClient, {
      clientId: credentials.clientId,
      secretHash: credentials.secretHash,
      registrationTokenHash: credentials.registrationTokenHash,
      tokenHash,
      githubRepositoryDatabaseId: token.githubRepositoryDatabaseId,
      githubOwnerId: token.githubOwnerId,
      githubRepository: token.githubRepository,
      app: token.app,
      connectors: enrollment,
      policyConnectors,
      configuredConnectors: args.connectors,
      redirectUris: body.redirectUris,
      softwareVersion: body.softwareVersion,
      tokenEndpointAuthMethod: body.tokenEndpointAuthMethod,
    });
    if (!created.ok) {
      if (created.reason === "invalid_connectors") {
        return await logged(facts, grantRevoked(created.allowed));
      }
      return await logged(
        facts,
        created.reason === "invalid_token" ? invalidToken() : denied(created.reason),
      );
    }
    return await logged(
      facts,
      json(
        newClient(credentials, {
          clientId: credentials.clientId,
          createdAt: created.createdAt,
          redirectUris: body.redirectUris,
          clientName: created.clientName,
          tenantId: created.tenantId,
          app: token.app,
          softwareVersion: body.softwareVersion,
          tokenEndpointAuthMethod: body.tokenEndpointAuthMethod,
          connectors: enrollment,
        }),
        201,
      ),
    );
  }

  /**
   * The Bearer is the proof, told apart by its shape: two dots is a JWT, GitHub's OIDC token of a
   * GitHub Actions run, which is checked as such and refused when any check fails; no dot is the
   * app's initial access token, for a development client. Any other shape is a bad token. The hub
   * builds the whole client, so the body chooses only a name inside the repository's own namespace
   * and a return address. The client's secret and registration access token stay in this action's
   * memory: they go to the caller and to nothing else.
   */
  return httpActionGeneric(async (ctx, request) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (bearer === undefined) {
      return noToken();
    }
    // A JWT has three parts; the initial access token is base64url, which has no dot.
    const parts = bearer.split(".").length;
    if (parts === 3) {
      return await registerRun(ctx, request, bearer);
    }
    if (parts === 1) {
      return await registerDevelopment(ctx, request, bearer);
    }
    return invalidToken();
  });
}
