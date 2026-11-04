/// <reference types="vite-plus/client" />
import { register as registerIdentityBroker } from "@samebase/identity-broker/test";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { vi } from "vite-plus/test";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./test.setup.ts",
]);

export const ISSUER = "https://auth.test";
export const MODERATION_KEY = "moderation-key";
export const REPOSITORY_ID = "74";
export const OWNER_ID = "65";
/** The first 32 hex characters of the SHA-256 of `my-app`, from `shasum -a 256`. */
export const APP_HASH = "4c9a75cca717efb68c856f26ba825073";
export const PRODUCTION_HOST = "https://ideal-dolphin-15.convex.site";
export const PRODUCTION_CALLBACK = `${PRODUCTION_HOST}/auth/hub/callback`;
const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

/**
 * The hub with the broker component, as `convex/convex.config.ts` mounts it. The issuer is read when
 * `convex/broker.ts` loads, so every test file uses the same one.
 */
export function makeConvexTest() {
  vi.stubEnv("ISSUER", ISSUER);
  vi.stubEnv("HUB_MODERATION_KEY", MODERATION_KEY);
  const t = convexTest(schema, modules);
  registerIdentityBroker(t);
  return t;
}

export type ConvexTest = ReturnType<typeof makeConvexTest>;

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
  t: ConvexTest,
  token: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return await t.fetch("/hub-clients", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      app: "my-app",
      redirectUri: PRODUCTION_CALLBACK,
      softwareVersion: "abc123",
      ...body,
    }),
  });
}

/** The 201 answer of `POST /hub-clients`. */
export type NewClient = {
  issuer: string;
  client_id: string;
  client_secret: string;
  registration_access_token: string;
  registration_client_uri: string;
  redirect_uri: string;
  terms: string;
};

/** A client of a run of main in the repository of `claims`, which must be created. */
export async function createClient(
  t: ConvexTest,
  claims: { repository_id?: string; repository_owner_id?: string; repository?: string } = {},
): Promise<NewClient> {
  stubProviders(() => jsonResponse({ repository: claims.repository_id ?? REPOSITORY_ID }));
  const response = await postHubClient(t, await signToken(claims));
  if (response.status !== 201) {
    throw new Error(`POST /hub-clients answered ${response.status}`);
  }
  return await response.json();
}

/** A read of the client's own record (RFC 7592), which renews it: 200, or 403 when it is stopped. */
export async function readOwnRecord(t: ConvexTest, client: NewClient) {
  const response = await t.fetch(new URL(client.registration_client_uri).pathname, {
    headers: { Authorization: `Bearer ${client.registration_access_token}` },
  });
  return response.status;
}

export async function moderationRequest(
  t: ConvexTest,
  path: string,
  init: { method?: string; body?: unknown; key?: string | null } = {},
) {
  const key = init.key === undefined ? MODERATION_KEY : init.key;
  return await t.fetch(path, {
    method: init.method ?? "GET",
    headers: {
      ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

export async function setBlock(
  t: ConvexTest,
  change: {
    action: "block" | "unblock";
    kind: "repository" | "owner";
    githubId: string;
    reason?: string;
  },
) {
  return await moderationRequest(t, "/moderation/blocks", {
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
