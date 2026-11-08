/// <reference types="vite-plus/client" />
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import type { Connector } from "./connectors/types.js";
import { createHarness, fakeUpstream, type Harness } from "./harness.test.helper.js";
import type { Policy, PolicyFunction } from "./policy.js";
import type { RegistrationConfig } from "./registration.js";
import type { ResourceProvider } from "./resourceProviders.js";

export const MODERATION_KEY = "moderation-key";
export const REPOSITORY_ID = "74";
export const OWNER_ID = "65";
/** The first 32 hex characters of the SHA-256 of `my-app`, from `shasum -a 256`. */
export const APP_HASH = "4c9a75cca717efb68c856f26ba825073";
export const PRODUCTION_HOST = "https://ideal-dolphin-15.convex.site";
export const PRODUCTION_CALLBACK = `${PRODUCTION_HOST}/auth/hub/callback`;
/** A development server's return address on a local backend. */
export const LOOPBACK_CALLBACK = "http://127.0.0.1:3211/auth/hub/callback";
const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

/** The names of the test hub's two connectors, both of the fake provider. */
export const HUB_CONNECTORS = ["fake", "other"] as const;

/**
 * The policy of the test hub, in the shape of our hub's: every connector, no resources, and the
 * pause of `APPS_PAUSED`, read in the request so `vi.stubEnv` of it holds. `overrides` replace any
 * field.
 */
export function testPolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    connectors: [...HUB_CONNECTORS],
    resources: [],
    paused: process.env["APPS_PAUSED"] === "true",
    ...overrides,
  };
}

/**
 * Skips the hub's sign-in page for every app, as the admin's switch does, so a sign-in with one
 * offered connector goes straight to it. For tests about what follows the page.
 */
export async function skipSignInPage(h: Harness) {
  await h.t.run(async (ctx) => {
    await ctx.db.insert("signInPageExemptions", {
      target: { scope: "every_app" },
      reason: "A test about what follows the page",
    });
  });
}

/** The hub mode with `policy`, which reads `HUB_MODERATION_KEY` in each request. */
export function hubRegistration(policy: PolicyFunction = () => testPolicy()): RegistrationConfig {
  return {
    policy,
    moderationKey: () => process.env["HUB_MODERATION_KEY"],
    terms: "https://samebase.com/terms",
    privacy: "https://samebase.com/privacy",
    name: "Samebase",
    githubAudience: "samebase",
  };
}

/** The fake connector of `fakeUpstream`, and a second connector of the same provider. */
export function hubConnectors() {
  const { connector } = fakeUpstream();
  const other: Connector = { ...connector, name: "other", label: "Other" };
  return [connector, other];
}

/**
 * The broker in the hub mode, as the shared hub mounts it: two connectors and a `registration`
 * config with `policy` (the test policy by default), whose env is read in each request.
 */
export async function createHub(
  options: { policy?: PolicyFunction; resources?: ResourceProvider[] } = {},
) {
  vi.stubEnv("HUB_MODERATION_KEY", MODERATION_KEY);
  return await createHarness({
    connectors: hubConnectors(),
    ...(options.resources === undefined ? {} : { resources: options.resources }),
    registration: hubRegistration(options.policy),
  });
}

/**
 * The claims of the example token on
 * https://docs.github.com/en/actions/concepts/security/openid-connect, read on 2026-11-01. Only `aud`
 * and the claims that a test names differ, and the times are set when a test signs.
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
export const pullRequestClaims = { event_name: "pull_request", ref: "refs/pull/12/merge" };

const signing = await generateKeyPair("RS256");
export const foreignKey: CryptoKey = (await generateKeyPair("RS256")).privateKey;
const publicJwk: JWK = { ...(await exportJWK(signing.publicKey)), kid: "github-key", alg: "RS256" };

export async function signToken(
  claims: Record<string, unknown> = {},
  options: { key?: CryptoKey; expiresInSeconds?: number; withoutExpiry?: boolean } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const expiry = options.withoutExpiry ? {} : { exp: now + (options.expiresInSeconds ?? 300) };
  return await new SignJWT({ ...documentedClaims, ...claims, nbf: now - 600, iat: now, ...expiry })
    .setProtectedHeader({ alg: "RS256", kid: "github-key", typ: "JWT" })
    .sign(options.key ?? signing.privateKey);
}

export const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Answers GitHub's key set and every host's `/samebase-verification.json`, which by default names
 * this repository. Returns the requests for the file, with their options.
 */
export function stubProviders(host?: () => Response | Promise<Response>) {
  const fileRequests: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new Request(input, init).url;
      if (url === JWKS_URL) {
        return jsonResponse({ keys: [publicJwk] });
      }
      fileRequests.push({ url, init });
      return await (host ?? (() => jsonResponse({ repository: REPOSITORY_ID })))();
    }),
  );
  return fileRequests;
}

export async function postHubClient(
  h: Harness,
  token: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return await h.fetchBroker(`${h.issuer}/hub-clients`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      app: "my-app",
      redirectUri: PRODUCTION_CALLBACK,
      softwareVersion: "abc123",
      connectors: ["fake"],
      ...body,
    }),
  });
}

/** The 201 answer of `POST /hub-clients`. A production client also gets the app's token. */
export type NewClient = {
  issuer: string;
  client_id: string;
  client_secret: string;
  registration_access_token: string;
  registration_client_uri: string;
  redirect_uri: string;
  connectors: string[];
  terms: string;
  initial_access_token?: string;
  repository?: string;
};

/** A client of a run of main in the repository of `claims`, which must be created. */
export async function createClient(
  h: Harness,
  claims: { repository_id?: string; repository_owner_id?: string; repository?: string } = {},
): Promise<NewClient> {
  stubProviders(() => jsonResponse({ repository: claims.repository_id ?? REPOSITORY_ID }));
  const response = await postHubClient(h, await signToken(claims));
  if (response.status !== 201) {
    throw new Error(`POST /hub-clients answered ${response.status}`);
  }
  return await response.json();
}

/** The initial access token of the app `my-app`, from a new production client of a run of main. */
export async function createInitialAccessToken(h: Harness): Promise<string> {
  const token = (await createClient(h)).initial_access_token;
  if (token === undefined) {
    throw new Error("The production answer holds no initial access token.");
  }
  return token;
}

/** A development client on `LOOPBACK_CALLBACK`, which must be created. */
export async function createDevelopmentClient(h: Harness, token: string): Promise<NewClient> {
  const response = await postHubClient(h, token, { redirectUri: LOOPBACK_CALLBACK });
  if (response.status !== 201) {
    throw new Error(`POST /hub-clients answered ${response.status}`);
  }
  return await response.json();
}

/** A read of the client's own record (RFC 7592), which renews it: 200, or 403 when it is stopped. */
export async function readOwnRecord(h: Harness, client: NewClient) {
  const response = await h.fetchBroker(client.registration_client_uri, {
    headers: { Authorization: `Bearer ${client.registration_access_token}` },
  });
  return response.status;
}

/**
 * A client that `registration.register` creates directly, as a host that proves its callers in
 * another way: a client of a GitHub run, enrolled in the fake connector, with no registration event.
 */
export async function registerAtBroker(
  h: Harness,
  args: {
    tenantId: string;
    ownerId?: string;
    appId: string;
    deploymentType: "production" | "preview";
    clientId: string;
    clientName: string;
    redirectUri?: string;
    now: number;
  },
) {
  return await h.t.mutation(api.registration.register, {
    tenantId: args.tenantId,
    ...(args.ownerId === undefined ? {} : { ownerId: args.ownerId }),
    appId: args.appId,
    connectors: ["fake"],
    deploymentType: args.deploymentType,
    clientId: args.clientId,
    secretHash: "hash",
    registrationTokenHash: "token-hash",
    tokenEndpointAuthMethod: "client_secret_post",
    redirectUri: args.redirectUri ?? PRODUCTION_CALLBACK,
    clientName: args.clientName,
    softwareVersion: "abc123",
    app: "my-app",
    registeredBy: {
      kind: "github",
      githubRepository: "octo-org/octo-repo",
      githubOwnerId: args.ownerId ?? OWNER_ID,
      githubActorId: "12",
      githubActorLogin: "octocat",
      commitSha: "example-sha",
    },
    now: args.now,
  });
}

export async function moderationRequest(
  h: Harness,
  path: string,
  init: { method?: string; body?: unknown; key?: string | null } = {},
) {
  const key = init.key === undefined ? MODERATION_KEY : init.key;
  return await h.fetchBroker(`${h.issuer}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

export async function setBlock(
  h: Harness,
  change: {
    action: "block" | "unblock";
    kind: "repository" | "owner";
    githubId: string;
    reason?: string;
  },
) {
  return await moderationRequest(h, "/moderation/blocks", {
    method: "POST",
    body: {
      action: change.action,
      kind: change.kind,
      githubId: change.githubId,
      reason: change.reason ?? "Phishing page",
      adminEmail: "nicu@samebase.com",
    },
  });
}
