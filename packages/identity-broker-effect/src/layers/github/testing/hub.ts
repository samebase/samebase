// Test helpers of the GitHub layer (`POST /register`, `/register/<client>`), on the memory Store
// and the core services of src/core/testing/harness.ts. No test framework import: a helper returns
// values, and the test asserts. The port of hub.test.helper.ts of the Convex broker.
import { Effect, Schema } from "effect";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  TEST_ISSUER,
  txnCookie,
} from "../../../core/testing/harness.ts";
import { first } from "../../../store/Tx.ts";
import { ownerStop, refOf, repositoryStop, tenantIdOf } from "../clients.ts";
import { githubRoutes } from "../routes.ts";
import type { AllowList } from "../schemas.ts";
import { GithubSettings } from "../settings.ts";
import { setBlock as setStop, setExemption } from "./seeds.ts";

export const ISSUER = TEST_ISSUER;
export const REPOSITORY_ID = "74";
export const OWNER_ID = "65";
/** The first 32 hex characters of the SHA-256 of `my-app`, from `shasum -a 256`. */
export const APP_HASH = "4c9a75cca717efb68c856f26ba825073";
export const APP_ID = `gh-${REPOSITORY_ID}-${APP_HASH}`;
export const PRODUCTION_HOST = "https://ideal-dolphin-15.convex.site";
export const PRODUCTION_CALLBACK = `${PRODUCTION_HOST}/auth/hub/callback`;
/** A development server's return address on a local backend. */
export const LOOPBACK_CALLBACK = "http://127.0.0.1:3211/auth/hub/callback";
export const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
/** The start of every test's clock: 2027-01-15, a whole second. */
export const EPOCH = 1_800_000_000_000;

/** The names of the test hub's two connectors, both of the fake provider. */
export const HUB_CONNECTORS = ["fake", "other"] as const;

/** Every repository and owner that a test of this layer names, each with each. */
const TEST_REPOSITORIES = [REPOSITORY_ID, "75", "76", "80", "81", "101", "102"];
const TEST_OWNERS = [OWNER_ID, "66", "90", "201", "202"];

/** The test hub's allow-list: every pair of a test repository and a test owner. */
export const TEST_ALLOW_LIST: typeof AllowList.Type = TEST_REPOSITORIES.flatMap((repositoryId) =>
  TEST_OWNERS.map((ownerId) => ({ repositoryId, ownerId })),
);

/**
 * The broker with the GitHub layer (`createBroker` of the harness with the layer's routes): the
 * fake provider's connector `fake` and a second connector `other` of the same provider, and the
 * allow-list `allowList` (every test repository and owner by default), which `setAllowList`
 * changes for the next command. The clock starts at `EPOCH`.
 */
export async function createHub(
  options: { allowList?: typeof AllowList.Type; seed?: number } = {},
) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  let allowList = options.allowList ?? TEST_ALLOW_LIST;
  const broker = await createBroker({
    fetch,
    config: { connectors: [connector, { ...connector, name: "other", label: "Other" }] },
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    // Each request reads the allow-list of that moment, as a host reads its settings.
    registration: {
      routes: githubRoutes.map((route) => ({
        ...route,
        handler: (request: Request) =>
          Effect.suspend(() =>
            route.handler(request).pipe(Effect.provideService(GithubSettings, { allowList })),
          ),
      })),
    },
  });
  broker.clock.set(EPOCH);
  return {
    ...broker,
    setAllowList: (next: typeof AllowList.Type) => {
      allowList = next;
    },
    /** Every document of every table, in insertion order. */
    rows: () => broker.memory.db.contents(),
  };
}
export type Hub = Awaited<ReturnType<typeof createHub>>;

let signingKeys:
  | Promise<{ privateKey: CryptoKey; publicJwk: JWK; foreignKey: CryptoKey }>
  | undefined;
/** GitHub's signing key of the tests, and another key that GitHub does not publish. */
function githubKeys() {
  signingKeys ??= (async () => {
    const signing = await generateKeyPair("RS256");
    const foreign = await generateKeyPair("RS256");
    return {
      privateKey: signing.privateKey,
      publicJwk: { ...(await exportJWK(signing.publicKey)), kid: "github-key", alg: "RS256" },
      foreignKey: foreign.privateKey,
    };
  })();
  return signingKeys;
}

/**
 * The claims of the example token on
 * https://docs.github.com/en/actions/concepts/security/openid-connect, read on 2026-11-01. Only `aud`,
 * the hub's issuer, and the claims that a test names differ, and the times are set when a test
 * signs.
 */
const documentedClaims = {
  jti: "example-id",
  sub: "repo:octo-org/octo-repo:environment:prod",
  environment: "prod",
  aud: ISSUER,
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
export const pullRequestClaims = { event_name: "pull_request", ref: "refs/pull/12/merge" };

/** A GitHub Actions OIDC token issued at the hub's clock time. */
export async function signToken(
  h: Pick<Hub, "clock">,
  claims: Record<string, unknown> = {},
  options: { foreign?: true; expiresInSeconds?: number; withoutExpiry?: true } = {},
): Promise<string> {
  const keys = await githubKeys();
  const now = Math.floor(h.clock.now() / 1_000);
  const expiry = options.withoutExpiry ? {} : { exp: now + (options.expiresInSeconds ?? 300) };
  return await new SignJWT({ ...documentedClaims, ...claims, nbf: now - 600, iat: now, ...expiry })
    .setProtectedHeader({ alg: "RS256", kid: "github-key", typ: "JWT" })
    .sign(options.foreign ? keys.foreignKey : keys.privateKey);
}

export const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

/**
 * Answers GitHub's key set and every host's `/samebase-verification.json`, which by default names
 * this repository. Returns the requests for the file. A later call's plans win over an earlier's.
 */
export async function stubProviders(
  h: Pick<Hub, "fetch">,
  host: (request: Request) => Response | Promise<Response> = () =>
    jsonResponse({ repository: REPOSITORY_ID }),
) {
  const { publicJwk } = await githubKeys();
  const fileRequests: Request[] = [];
  h.fetch.plan({
    match: (request) => new URL(request.url).pathname === "/samebase-verification.json",
    respond: async (request) => {
      fileRequests.push(request);
      return await host(request);
    },
  });
  h.fetch.json(JWKS_URL, { keys: [publicJwk] });
  return fileRequests;
}

/**
 * `POST /register` with the client metadata of the app `my-app`, which `body` changes: a member set
 * to `undefined` is left out. The client posts its secret; the hub's own default is
 * `client_secret_basic`.
 */
export async function postHubClient(
  h: Hub,
  token: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return await h.fetchBroker(`${h.issuer}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      software_id: "my-app",
      redirect_uris: [PRODUCTION_CALLBACK],
      software_version: "abc123",
      connectors: ["fake"],
      token_endpoint_auth_method: "client_secret_post",
      ...body,
    }),
  });
}

/**
 * The 201 answer of `POST /register` (RFC 7591 section 3.2.1). A production client also gets the
 * app's initial access token and the repository's id.
 */
export const NewClient = Schema.Struct({
  client_id: Schema.String,
  client_id_issued_at: Schema.Number,
  client_secret_expires_at: Schema.Number,
  registration_client_uri: Schema.String,
  redirect_uris: Schema.Array(Schema.String),
  client_name: Schema.String,
  software_id: Schema.String,
  software_version: Schema.String,
  token_endpoint_auth_method: Schema.Literals(["client_secret_post", "client_secret_basic"]),
  grant_types: Schema.Array(Schema.String),
  response_types: Schema.Array(Schema.String),
  application_type: Schema.String,
  subject_type: Schema.String,
  id_token_signed_response_alg: Schema.String,
  connectors: Schema.Array(Schema.String),
  client_secret: Schema.String,
  registration_access_token: Schema.String,
  issuer: Schema.String,
  terms: Schema.String,
  initial_access_token: Schema.optionalKey(Schema.String),
  repository: Schema.optionalKey(Schema.String),
});
export type NewClient = typeof NewClient.Type;

/** The 201 answer's client. A body of another shape throws. */
export const readNewClient = async (response: Response): Promise<NewClient> =>
  Schema.decodeUnknownSync(NewClient)(await response.json());

/** A client of a run of main in the repository of `claims`, which must be created. */
export async function createClient(
  h: Hub,
  claims: { repository_id?: string; repository_owner_id?: string; repository?: string } = {},
): Promise<NewClient> {
  await stubProviders(h, () => jsonResponse({ repository: claims.repository_id ?? REPOSITORY_ID }));
  const response = await postHubClient(h, await signToken(h, claims));
  if (response.status !== 201) {
    throw new Error(`POST /register answered ${response.status}`);
  }
  return await readNewClient(response);
}

/** The initial access token of the app `my-app`, from a new production client of a run of main. */
export async function createInitialAccessToken(h: Hub): Promise<string> {
  const token = (await createClient(h)).initial_access_token;
  if (token === undefined) {
    throw new Error("The production answer holds no initial access token.");
  }
  return token;
}

/** A development client on `LOOPBACK_CALLBACK`, which must be created. */
export async function createDevelopmentClient(h: Hub, token: string): Promise<NewClient> {
  const response = await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] });
  if (response.status !== 201) {
    throw new Error(`POST /register answered ${response.status}`);
  }
  return await readNewClient(response);
}

/** A read of the client's own record (RFC 7592), which renews it: 200, or 403 when it is stopped. */
export async function readOwnRecord(
  h: Hub,
  client: { registration_client_uri: string; registration_access_token: string },
) {
  const response = await h.fetchBroker(client.registration_client_uri, {
    headers: { Authorization: `Bearer ${client.registration_access_token}` },
  });
  return response.status;
}

/**
 * A client and its card written straight into the store, with the app and the tenant (owner
 * `ownerId`, default `OWNER_ID`) when absent: a card of a GitHub run enrolled in and offering
 * `fake`, with the page, and no registration event. No command writes such a client; the rows are
 * the seed of the cap and eviction tests.
 */
export function seedClient(
  h: Hub,
  args: {
    repositoryId: string;
    ownerId?: string;
    appId: string;
    deploymentType: "production" | "preview" | "development";
    clientId: string;
    clientName: string;
    redirectUri?: string;
    lastSignInAt?: number;
    now: number;
  },
) {
  const tenantId = tenantIdOf(args.repositoryId);
  const ownerId = args.ownerId ?? OWNER_ID;
  h.memory.withTx((tx) =>
    Effect.gen(function* () {
      if ((yield* first(tx, "apps", "by_app_id", [args.appId])) === undefined) {
        yield* tx.insert("apps", { appId: args.appId, tenantId });
      }
      const tenant = yield* first(tx, "tenants", "by_tenant_id", [tenantId]);
      if (tenant === undefined) {
        yield* tx.insert("tenants", { tenantId, ownerId, ownerProofIssuedAt: 0 });
      } else {
        yield* tx.replace("tenants", tenant.id, { ...tenant.doc, ownerId });
      }
      yield* tx.insert("clients", {
        clientId: args.clientId,
        redirectUris: [args.redirectUri ?? PRODUCTION_CALLBACK],
        tokenEndpointAuthMethod: "client_secret_post",
        secretHash: "hash",
        connectors: ["fake"],
        gates: [repositoryStop(args.repositoryId), ownerStop(ownerId)],
        confirm: true,
        budget: refOf(tenantId),
        ref: refOf(tenantId),
        ...(args.deploymentType === "production"
          ? {}
          : { removeAt: args.now + 14 * 24 * 60 * 60 * 1000 }),
        createdAt: args.now,
        ...(args.lastSignInAt === undefined ? {} : { lastSignInAt: args.lastSignInAt }),
        github: {
          appId: args.appId,
          app: "my-app",
          deploymentType: args.deploymentType,
          clientName: args.clientName,
          softwareVersion: "abc123",
          registrationTokenHash: "token-hash",
          renewedAt: args.now,
          registeredBy: {
            kind: "github",
            githubRepository: "octo-org/octo-repo",
            githubOwnerId: ownerId,
            githubActorId: "12",
            githubActorLogin: "octocat",
            commitSha: "example-sha",
          },
          enrollment: ["fake"],
        },
      });
    }),
  );
}

/**
 * Exempts the test repository of the test owner from the sign-in page, so the cards that it
 * registers after this call send a sign-in with one offered connector straight to it. For tests
 * about what follows the page.
 */
export function skipSignInPage(h: Hub) {
  setExemption(h.memory, { repositoryId: REPOSITORY_ID, ownerId: OWNER_ID }, true);
}

/**
 * A whole sign-in of `client` at `redirectUri` through the fake provider, as a browser and the app
 * do it: `/authorize`, the provider's callback with the transaction cookie, and the token request
 * with the client's secret in the form. Answers the token response, or the `/authorize` answer when
 * it sends the browser nowhere.
 */
export async function signIn(
  h: Hub,
  client: { client_id: string; client_secret: string },
  redirectUri: string,
) {
  const { verifier, challenge } = await pkce();
  const authorize = new URL(`${h.issuer}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    nonce: "client-nonce",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const start = await h.fetchBroker(authorize);
  const location = start.headers.get("location");
  if (location === null) {
    return start;
  }
  const upstream = new URL(location);
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(start) });
  const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
  return await h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
    }).toString(),
  });
}

/** Sets or removes the stop of a repository or an owner. */
export function setBlock(
  h: Hub,
  change: { action: "block" | "unblock"; kind: "repository" | "owner"; githubId: string },
) {
  setStop(h.memory, { kind: change.kind, githubId: change.githubId }, change.action === "block");
}
