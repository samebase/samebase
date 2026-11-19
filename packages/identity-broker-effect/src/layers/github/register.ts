import { Clock, Effect, Option, Schema } from "effect";
import { base64url, createLocalJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { LOOPBACK_HOSTS, parseRedirectUri } from "../../core/protocol.ts";
import { invalidToken, json, noToken } from "../../core/responses.ts";
import { Fetch, HubConfig, Random } from "../../core/services.ts";
import { sha256HexEffect } from "../../core/subject.ts";
import { clientInformation, insufficientScope, newClientCredentials } from "./manage.ts";
import { command, GithubSettings } from "./settings.ts";

// `POST /register`, the client registration endpoint of RFC 7591: a new client for one deployment
// of an app, with no account at the hub. The endpoint is protected (RFC 7591 appendix A.1.2): the
// Bearer is the initial access token, and it is the proof. A GitHub Actions run proves its
// repository with GitHub's OIDC token; a development server proves the app with the app's own
// initial access token, which a production run got. The settings' allow-list and the grants decide
// what the registration may enroll in. The rows and the rules that read them are the `github.*`
// commands of registration.ts: `admit` and the creating command are two steps, with the
// verification files fetched between them, and the creating command writes the card.

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
/** The return addresses of one client: a handler per flow of the app, with room to spare. */
const MAX_REDIRECT_URIS = 8;
/** Stored on every client row. A commit hash or a version fits many times. */
const MAX_SOFTWARE_VERSION_LENGTH = 256;
/** The app's name is stored on every client and shown on the admin page. */
const MAX_APP_LENGTH = 64;

/** The app of a registration without `software_id`. */
const DEFAULT_APP = "app";
/** The full form of `software_id`, `<tenant id>/<app name>`, whose tenant is a repository's. */
const FULL_SOFTWARE_ID = /^gh-[1-9][0-9]*\//;

// Each schema below accepts unknown members: GitHub and a host send more than these name. They
// narrow the value that was read (`Schema.is`), so the members that they do not name stay on it.

/**
 * The client metadata of a registration request that the hub reads (RFC 7591 section 2), but
 * `redirect_uris`, which has its own error. Any other member is ignored, as that section requires,
 * but the ones in `UNSUPPORTED_MEMBERS`.
 */
const RequestBody = Schema.Struct({
  /**
   * The app: its name alone, or `<tenant id>/<app name>`. Absent: `DEFAULT_APP`. The same for each
   * deployment of the app.
   */
  software_id: Schema.optionalKey(Schema.String),
  /** Absent: `unknown`. */
  software_version: Schema.optionalKey(Schema.String),
  /**
   * The enrollment, the hub's own member: at least one connector name. Duplicates collapse. Absent:
   * every connector that this registration may enroll in.
   */
  connectors: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Absent: `client_secret_basic`, the default of RFC 7591 section 2. */
  token_endpoint_auth_method: Schema.optionalKey(
    Schema.Literals(["client_secret_post", "client_secret_basic"]),
  ),
  /** The hub answers its own values: a client asks for nothing here that the hub does not have. */
  grant_types: Schema.optionalKey(
    Schema.Array(Schema.Literals(["authorization_code", "refresh_token"])),
  ),
  response_types: Schema.optionalKey(Schema.Array(Schema.Literal("code"))),
  // The one value of each that the hub has (OpenID Connect Registration section 2).
  application_type: Schema.optionalKey(Schema.Literal("web")),
  subject_type: Schema.optionalKey(Schema.Literal("public")),
  id_token_signed_response_alg: Schema.optionalKey(Schema.Literal("RS256")),
});

/** The return addresses: one to `MAX_REDIRECT_URIS`. Duplicates collapse; the order does not matter. */
const RedirectUris = Schema.Struct({ redirect_uris: Schema.Array(Schema.String) });

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
const VerificationFile = Schema.Struct({
  repository: Schema.Union([Schema.String, Schema.Number]),
});

/**
 * A JSON refusal: `error`, with a fixed sentence as `error_description` that never quotes the
 * request. `reason`, `allowed`, and `window` are the hub's own members.
 */
function refusal(
  status: number,
  error: string,
  description: string,
  more: { reason?: string; allowed?: readonly string[]; window?: string } = {},
): Response {
  return json({ error, error_description: description, ...more }, status);
}

/** A registration error of RFC 7591 section 3.2.2. */
function invalid(
  error: "invalid_redirect_uri" | "invalid_client_metadata",
  description: string,
  more: { reason?: string; allowed?: readonly string[] } = {},
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
type VerificationRefusal = keyof typeof VERIFICATION_REFUSALS;

/** A site of the return addresses fails its verification file. */
const unverifiedHost = (reason: VerificationRefusal) =>
  invalid("invalid_redirect_uri", VERIFICATION_REFUSALS[reason], { reason });

/** The sentence of each rule that refuses a good token. */
const DENIALS = {
  run_not_allowed: "Only a pull request or a run of main may register a client.",
  blocked: "This repository or its owner is blocked.",
  stale_proof: "A newer token of this repository has registered a client.",
  app_mismatch: "The initial access token is for another app.",
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
const invalidConnectors = (allowed: readonly string[]) =>
  invalid(
    "invalid_client_metadata",
    "The connectors are not ones that this registration may enroll in.",
    { reason: "invalid_connectors", allowed },
  );

/** The body of every JSON refusal of this endpoint. */
const RefusalBody = Schema.Struct({
  error: Schema.String,
  reason: Schema.optionalKey(Schema.String),
});
const decodeRefusalBody = Schema.decodeUnknownOption(RefusalBody);

/** What a registration's log line names: the repository, the app and the deployment type. */
type Facts = {
  readonly repositoryId: string;
  readonly repository: string;
  readonly ownerId: string;
  readonly app: string;
  readonly deploymentType: "production" | "preview" | "development";
};

/**
 * Writes one console line, `hub_event` and a JSON object, for the answer to a registration: the
 * repository, the app, the deployment type, and the reason of a refusal. A log stream of the
 * host's deployment carries it out. It never names a token or a return address.
 */
const logRegistration = (facts: Facts, reason: string | null) =>
  console.info(
    `hub_event ${JSON.stringify({
      event: reason === null ? "registration" : "registration_refused",
      repository: facts.repository,
      app: facts.app,
      deployment: facts.deploymentType,
      reason,
    })}`,
  );

/**
 * The answer to a registration with `facts`, after its `hub_event` line. A refusal's reason is the
 * rule that a 403 names, else its error. The body of a 201 holds the client's secrets, so it is not
 * read.
 */
const logged = Effect.fnUntraced(function* (facts: Facts, response: Response) {
  if (response.status === 201) {
    logRegistration(facts, null);
    return response;
  }
  const body: unknown = yield* Effect.promise(() => response.clone().json());
  logRegistration(
    facts,
    Option.match(decodeRefusalBody(body), {
      onNone: () => String(response.status),
      onSome: (refused) => refused.reason ?? refused.error,
    }),
  );
  return response;
});

// The GitHub Actions proof. Everything after `readRun` works on GitHub's ids, so a second proof
// would be a second section like this one, not a change to the rest.

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;

/**
 * GitHub's key set. jose checks each key, so this checks only the shape that it takes. The array is
 * mutable because jose's `JSONWebKeySet` type is.
 */
const GitHubKeySet = Schema.Struct({
  keys: Schema.mutable(Schema.Array(Schema.Struct({ kty: Schema.String }))),
});
const isGitHubKeySet = Schema.is(GitHubKeySet);

/**
 * `aud` is one string, the hub's issuer: jose alone also accepts a list that holds the audience,
 * and it has already checked the value. So a token that a deploy made for one hub is no use at
 * another hub, also when that hub's operator replays it.
 */
const GitHubClaims = Schema.Struct({
  aud: Schema.String,
  event_name: Schema.String,
  ref: Schema.String,
  repository_id: Schema.String,
  repository_owner_id: Schema.String,
  repository: Schema.String,
  actor_id: Schema.String,
  actor: Schema.String,
  sha: Schema.String,
  /** Seconds. It orders two proofs of one repository, so an older one cannot undo a newer one. */
  iat: Schema.Number,
});
const decodeGitHubClaims = Schema.decodeUnknownOption(GitHubClaims);

/** GitHub's key set, read for each token: the core keeps no memory between requests. */
async function readGitHubKeySet(fetch: (request: Request) => Promise<Response>) {
  const response = await fetch(
    new Request(GITHUB_OIDC_JWKS_URL, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  );
  const keySet: unknown = response.ok ? await response.json() : null;
  if (!isGitHubKeySet(keySet)) {
    throw new Error(`GitHub answered ${response.status} without a key set.`);
  }
  return keySet;
}

/**
 * The claims of a good token for `audience` at `now`, or null for a bad one. It rejects when GitHub
 * cannot be reached.
 */
async function verifyGitHubToken(
  fetch: (request: Request) => Promise<Response>,
  token: string,
  audience: string,
  now: number,
) {
  try {
    const { payload } = await jwtVerify(
      token,
      async (header, input) => createLocalJWKSet(await readGitHubKeySet(fetch))(header, input),
      {
        algorithms: ["RS256"],
        audience,
        issuer: GITHUB_OIDC_ISSUER,
        requiredClaims: ["exp", "iat"],
        currentDate: new Date(now),
      },
    );
    return Option.getOrNull(decodeGitHubClaims(payload));
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

/**
 * GitHub's signing keys cannot be read. `message` is the key set's status or the fetch's own
 * error, never the token.
 */
class GitHubUnavailable extends Schema.TaggedError<GitHubUnavailable>()("GitHubUnavailable", {
  message: Schema.String,
}) {}

/** The verified run of a GitHub token for `audience`, or the reply that refuses it. */
const readRun = Effect.fn("readRun")(function* (token: string, audience: string) {
  const { fetch } = yield* Fetch;
  const now = yield* Clock.currentTimeMillis;
  const claims = yield* Effect.tryPromise({
    try: () => verifyGitHubToken(fetch, token, audience, now),
    catch: (error) =>
      new GitHubUnavailable({ message: error instanceof Error ? error.message : "unknown" }),
  }).pipe(
    Effect.catchTag("GitHubUnavailable", (error) =>
      Effect.logWarning("hub_clients:github_unavailable", { message: error.message }).pipe(
        Effect.as(refusal(502, "github_unavailable", "GitHub's signing keys cannot be read.")),
      ),
    ),
  );
  if (claims instanceof Response) {
    return claims;
  }
  if (claims === null) {
    return invalidToken();
  }
  const stage = readRunStage(claims);
  return stage === null ? denied("run_not_allowed") : { claims, stage };
});

// The request and the host.

/**
 * The return address, if `parseRedirectUri` takes it, with no fragment and no user info, and either
 * https on a DNS name, which the verification file proves, or http on a loopback host, which only
 * the initial access token can prove: the hub cannot reach a development server. An IP address or
 * `localhost` over https is never a host that a file can prove. Any port and any path.
 */
function readRedirectUri(value: string) {
  // An empty fragment parses to an empty hash, which parseRedirectUri allows.
  const url = value.includes("#") ? null : parseRedirectUri(value);
  if (url === null || url.username !== "" || url.password !== "") {
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

const isRequestBody = Schema.is(RequestBody);
const isRedirectUris = Schema.is(RedirectUris);

/**
 * The client metadata of the body, or the answer that refuses it: the app's name, from a
 * `software_id` whose full form must name `repositoryId`, the proof's repository; `redirectUris`
 * sorted and unique, each parsed, with `loopback` when any of them is a loopback address. The
 * enrollment it names is checked by `github.admit`.
 */
function readBody(body: unknown, repositoryId: string) {
  if (!isRequestBody(body)) {
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
  if (!isRedirectUris(body)) {
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
      "A redirect URI is https on a DNS name, or http on a loopback host for a development client, with no fragment, no user info, and no authorization response parameter in its query.",
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

const isVerificationFile = Schema.is(VerificationFile);

/**
 * Null when `origin` serves `VERIFICATION_PATH` with `repositoryId`, else the reason of the refusal.
 * A redirect is never followed: the file must be on the host itself. The reason never holds the body
 * or the id that the file names. It never rejects.
 */
async function verifyHost(
  fetch: (request: Request) => Promise<Response>,
  origin: string,
  repositoryId: string,
): Promise<VerificationRefusal | null> {
  let text;
  try {
    const response = await fetch(
      new Request(new URL(VERIFICATION_PATH, origin), {
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MS),
      }),
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      return "verification_file_missing";
    }
    text = await readSmallBody(response);
  } catch {
    return "host_unreachable";
  }
  let file: unknown = null;
  try {
    file = text === null ? null : JSON.parse(text);
  } catch {
    // Not JSON.
  }
  if (!isVerificationFile(file)) {
    return "verification_file_invalid";
  }
  // A fraction, a negative number, or a number too large for JSON to keep fails here.
  const id = String(file.repository);
  if (!/^[1-9][0-9]*$/.test(id)) {
    return "verification_file_invalid";
  }
  return id === repositoryId ? null : "repository_mismatch";
}

/** Null when every origin serves the file with `repositoryId`, else the first refusal, in order. */
const verifyHosts = Effect.fn("verifyHosts")(function* (
  origins: readonly string[],
  repositoryId: string,
) {
  const { fetch } = yield* Fetch;
  for (const origin of origins) {
    const reason = yield* Effect.promise(() => verifyHost(fetch, origin, repositoryId));
    if (reason !== null) {
      return reason;
    }
  }
  return null;
});

/**
 * The app id of `app` in the tenant of the repository: the tenant id, a hyphen, and the first 32 hex
 * characters of SHA-256 of the app name. The core computes it, so no state rule hashes (design
 * section 2.2); the creating command keys the app row on it.
 */
const appIdOf = (repositoryId: string, app: string) =>
  Effect.map(sha256HexEffect(app), (hash) => `gh-${repositoryId}-${hash.slice(0, 32)}`);

/** What the handlers read of the hub's settings and the layer's. */
const hubSettings = Effect.gen(function* () {
  const config = yield* HubConfig;
  const { allowList } = yield* GithubSettings;
  return {
    issuer: config.issuer,
    terms: config.service.terms,
    /** Given whole to each command that checks an enrollment or writes a card. */
    settings: { allowList, configured: config.configured },
  };
});
type HubSettings = Effect.Success<typeof hubSettings>;

/**
 * The enrollment of an admitted request, or the answer that refuses it: a stopped repository or
 * owner, a set that is empty or outside what the allow-list and the repository's grants give (with
 * the names allowed), or a limit. It counts an admitted request in the repository and owner
 * windows; a refused one counts nowhere.
 */
const admit = Effect.fn("admit")(function* (
  hub: HubSettings,
  facts: Facts,
  connectors: readonly string[] | undefined,
) {
  const admission = yield* command("github.admit", {
    githubRepositoryDatabaseId: facts.repositoryId,
    githubOwnerId: facts.ownerId,
    ...(connectors === undefined ? {} : { connectors }),
    ...hub.settings,
  });
  if (admission.ok) {
    return admission.enrollment;
  }
  switch (admission.reason) {
    case "blocked":
      return denied("blocked");
    case "rate_limited":
      return rateLimited(admission.window);
    case "invalid_connectors":
      return invalidConnectors(admission.allowed);
    default:
      return admission satisfies never;
  }
});

/**
 * The 201 answer (RFC 7591 section 3.2.1): the client's registered metadata, its secret, and its
 * RFC 7592 token, which go to nothing else. `issuer` and `terms` are the hub's own members.
 */
function newClient(
  hub: HubSettings,
  credentials: Effect.Success<typeof newClientCredentials>,
  client: Omit<Parameters<typeof clientInformation>[0], "issuer">,
) {
  return {
    ...clientInformation({ ...client, issuer: hub.issuer }),
    client_secret: credentials.clientSecret,
    registration_access_token: credentials.registrationAccessToken,
    issuer: hub.issuer,
    terms: hub.terms,
  };
}

/**
 * A client for a GitHub Actions run, with GitHub's OIDC token. A run of main also gets the app's
 * initial access token, which a development server of the team uses for its development client.
 */
const registerRun = Effect.fn("registerRun")(function* (
  hub: HubSettings,
  request: Request,
  githubToken: string,
) {
  const run = yield* readRun(githubToken, hub.issuer);
  if (run instanceof Response) {
    return run;
  }
  const body = readBody(
    yield* Effect.promise(() => request.json().catch(() => null)),
    run.claims.repository_id,
  );
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

  const facts: Facts = {
    repositoryId: run.claims.repository_id,
    repository: run.claims.repository,
    ownerId: run.claims.repository_owner_id,
    app: body.app,
    deploymentType: run.stage === "prod" ? "production" : "preview",
  };
  const enrollment = yield* admit(hub, facts, body.connectors);
  if (enrollment instanceof Response) {
    return yield* logged(facts, enrollment);
  }
  const unverified = yield* verifyHosts(body.origins, run.claims.repository_id);
  if (unverified !== null) {
    return yield* logged(facts, unverifiedHost(unverified));
  }

  const credentials = yield* newClientCredentials;
  // 32 random bytes in base64url, so the token has no dot and never looks like a JWT.
  const initialAccessToken =
    run.stage === "prod" ? base64url.encode(yield* (yield* Random).bytes(32)) : null;
  const created = yield* command("github.createClient", {
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
        : {
            type: "production",
            initialAccessTokenHash: yield* sha256HexEffect(initialAccessToken),
          },
    connectors: enrollment,
    app: body.app,
    appId: yield* appIdOf(run.claims.repository_id, body.app),
    redirectUris: body.redirectUris,
    softwareVersion: body.softwareVersion,
    tokenEndpointAuthMethod: body.tokenEndpointAuthMethod,
    ...hub.settings,
  });
  if (!created.ok) {
    // A grant or the owner's right went away while the handler checked the hosts.
    if (created.reason === "invalid_connectors") {
      return yield* logged(facts, invalidConnectors(created.allowed));
    }
    return yield* logged(
      facts,
      created.reason === "new_owners" ? rateLimited("new_owners") : denied(created.reason),
    );
  }
  return yield* logged(
    facts,
    json(
      {
        ...newClient(hub, credentials, {
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
});

/**
 * A development client, with the app's initial access token, which only a reader of the state of
 * the app's `prod` stage has. The repository and owner come from the token's row. A loopback
 * return address needs no verification file; an https one needs it, as for a run.
 */
const registerDevelopment = Effect.fn("registerDevelopment")(function* (
  hub: HubSettings,
  request: Request,
  initialAccessToken: string,
) {
  const tokenHash = yield* sha256HexEffect(initialAccessToken);
  const token = yield* command("github.readInitialAccessToken", { tokenHash });
  if (token === null) {
    return invalidToken();
  }
  const body = readBody(
    yield* Effect.promise(() => request.json().catch(() => null)),
    token.githubRepositoryDatabaseId,
  );
  if (body instanceof Response) {
    return body;
  }
  // The app's name: `software_id` in either form names it.
  if (body.app !== token.app) {
    return denied("app_mismatch");
  }

  const facts: Facts = {
    repositoryId: token.githubRepositoryDatabaseId,
    repository: token.githubRepository,
    ownerId: token.githubOwnerId,
    app: token.app,
    deploymentType: "development",
  };
  const enrollment = yield* admit(hub, facts, body.connectors);
  if (enrollment instanceof Response) {
    return yield* logged(facts, enrollment);
  }
  // A loopback address needs no file; each https origin does.
  const unverified = yield* verifyHosts(body.origins, token.githubRepositoryDatabaseId);
  if (unverified !== null) {
    return yield* logged(facts, unverifiedHost(unverified));
  }

  const credentials = yield* newClientCredentials;
  // The command reads the token's row again and refuses unless it still names this repository,
  // owner and app, and that owner still owns the repository, so the app id below is bound to the
  // row it checks.
  const created = yield* command("github.createDevelopmentClient", {
    clientId: credentials.clientId,
    secretHash: credentials.secretHash,
    registrationTokenHash: credentials.registrationTokenHash,
    tokenHash,
    githubRepositoryDatabaseId: token.githubRepositoryDatabaseId,
    githubOwnerId: token.githubOwnerId,
    githubRepository: token.githubRepository,
    app: token.app,
    appId: yield* appIdOf(token.githubRepositoryDatabaseId, token.app),
    connectors: enrollment,
    redirectUris: body.redirectUris,
    softwareVersion: body.softwareVersion,
    tokenEndpointAuthMethod: body.tokenEndpointAuthMethod,
    ...hub.settings,
  });
  if (!created.ok) {
    if (created.reason === "invalid_connectors") {
      return yield* logged(facts, invalidConnectors(created.allowed));
    }
    return yield* logged(
      facts,
      created.reason === "invalid_token" ? invalidToken() : denied(created.reason),
    );
  }
  return yield* logged(
    facts,
    json(
      newClient(hub, credentials, {
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
});

/**
 * `POST <prefix>/register`. The Bearer is the proof, told apart by its shape: two dots is a JWT,
 * GitHub's OIDC token of a GitHub Actions run, which is checked as such and refused when any check
 * fails; no dot is the app's initial access token, for a development client. Any other shape is a
 * bad token. The hub builds the whole client, so the body chooses only a name inside the
 * repository's own namespace and a return address. The client's secret and registration access
 * token stay in this program's memory: they go to the caller and to nothing else.
 */
export const registerClient = Effect.fn("registerClient")(function* (request: Request) {
  const hub = yield* hubSettings;
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (bearer === undefined) {
    return noToken("register");
  }
  // A JWT has three parts; the initial access token is base64url, which has no dot.
  const parts = bearer.split(".").length;
  if (parts === 3) {
    return yield* registerRun(hub, request, bearer);
  }
  if (parts === 1) {
    return yield* registerDevelopment(hub, request, bearer);
  }
  return invalidToken();
});
