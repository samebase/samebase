/// <reference types="vite-plus/client" />
import { register as registerIdentityBroker } from "@samebase/identity-broker/test";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { vi } from "vite-plus/test";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./test.setup.ts",
]);

export const MODERATION_KEY = "moderation-key";
export const REPOSITORY_ID = "74";
export const PRODUCTION_CALLBACK = "https://ideal-dolphin-15.convex.site/auth/hub/callback";
const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

/**
 * The hub with the broker component, as `convex/convex.config.ts` mounts it. The issuer is read when
 * `convex/broker.ts` loads, so every test file uses the same one.
 */
export function makeConvexTest() {
  vi.stubEnv("ISSUER", "https://auth.test");
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
  repository_owner_id: "65",
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

const signing = await generateKeyPair("RS256");
const publicJwk: JWK = { ...(await exportJWK(signing.publicKey)), kid: "github-key", alg: "RS256" };

export async function signToken(claims: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  return await new SignJWT({
    ...documentedClaims,
    ...claims,
    nbf: now - 600,
    iat: now,
    exp: now + 300,
  })
    .setProtectedHeader({ alg: "RS256", kid: "github-key", typ: "JWT" })
    .sign(signing.privateKey);
}

/**
 * Answers GitHub's key set and every host's `/samebase-verification.json`, which names
 * `repositoryId`.
 */
export function stubProviders(repositoryId = REPOSITORY_ID) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      Response.json(
        new Request(input, init).url === JWKS_URL
          ? { keys: [publicJwk] }
          : { repository: repositoryId },
      ),
    ),
  );
}

export async function postHubClient(t: ConvexTest, token: string): Promise<Response> {
  return await t.fetch("/hub-clients", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      app: "my-app",
      redirectUri: PRODUCTION_CALLBACK,
      softwareVersion: "abc123",
    }),
  });
}
