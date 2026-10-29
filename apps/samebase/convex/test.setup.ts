/// <reference types="vite/client" />

import { registerCore } from "@convex-dev/auth/test";
import { registerOauth } from "@convex-dev/auth/components/oauth/test";
import { registerPasswordProvider } from "@convex-dev/auth/components/password/test";
import workflowTest from "@convex-dev/workflow/test";
import { register as registerEmailInbox } from "@samebase/convex-cloudflare-email-inbox/test";
import { register as registerGitEditor } from "@samebase/git-editor/test";
import { convexTest } from "convex-test";
import { vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";
import { githubUserAuthorizationAad } from "./githubUserAuthorizationModel";
import {
  organizationCiCredentialAad,
  organizationProviderCredentialAad,
} from "./organization/providerCredentialModel";
import schema from "./schema";
import { sealSecret, type SealedSecret } from "./sealedSecret";

const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./**/*.convex.test.ts",
  "!./**/*.generated.ts",
  "!./test.setup.ts",
]);

/** A throwaway key ring: one key of 32 zero bytes. */
const TEST_CREDENTIAL_KEYS = JSON.stringify({
  current: "test",
  keys: { test: `${"A".repeat(43)}=` },
});

/**
 * Create an isolated Convex test backend with the same components installed as
 * the app so contract tests exercise registered functions through real refs.
 * It stubs CREDENTIAL_KEYS, which every credential seal and open reads.
 */
export function makeConvexTest() {
  vi.stubEnv("CREDENTIAL_KEYS", TEST_CREDENTIAL_KEYS);
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  registerEmailInbox(t, "mail");
  registerGitEditor(t, "gitEditor");
  registerCore(t);
  registerOauth(t, "authHub");
  registerPasswordProvider(t);
  return t;
}

const TEST_CREDENTIAL_IV = "placeholder";

/**
A credential that a fixture writes inside `t.run`, where no action can seal it. No key opens it
until sealTestCredentials seals `plaintext` for its field.
*/
export function testCredential(plaintext: string): SealedSecret {
  return { keyId: "test", iv: TEST_CREDENTIAL_IV, ciphertext: plaintext };
}

/**
Seals every testCredential in the provider, CI, and GitHub user credential rows for its owner and
field, in an action as the connect flows do, so the code under test opens them like rows that a
connect flow wrote.
*/
export async function sealTestCredentials(t: ReturnType<typeof makeConvexTest>): Promise<void> {
  const seal = async (value: SealedSecret, aad: string) =>
    value.iv === TEST_CREDENTIAL_IV
      ? await t.action(async (ctx) => await sealSecret(ctx, { plaintext: value.ciphertext, aad }))
      : value;
  const rows = await t.run(async (ctx) => ({
    provider: await ctx.db.query("organizationProviderCredentials").collect(),
    ci: await ctx.db.query("organizationCiCredentials").collect(),
    github: await ctx.db.query("githubUserAuthorizations").collect(),
  }));

  for (const { _id, organizationId, convex, cloudflare } of rows.provider) {
    const aad = (field: Parameters<typeof organizationProviderCredentialAad>[1]) =>
      organizationProviderCredentialAad(organizationId, field);
    let sealedCloudflare = cloudflare;
    if (cloudflare) {
      const credential = await seal(cloudflare.auth.credential, aad("cloudflare.auth.credential"));
      sealedCloudflare = {
        ...cloudflare,
        auth:
          cloudflare.auth.method === "api_key"
            ? { ...cloudflare.auth, credential }
            : {
                ...cloudflare.auth,
                credential,
                refreshCredential: await seal(
                  cloudflare.auth.refreshCredential,
                  aad("cloudflare.auth.refreshCredential"),
                ),
              },
      };
    }
    const patch = {
      convex: convex && {
        ...convex,
        auth: {
          ...convex.auth,
          credential: await seal(convex.auth.credential, aad("convex.auth.credential")),
        },
      },
      cloudflare: sealedCloudflare,
    };
    await t.run(async (ctx) => await ctx.db.patch(_id, patch));
  }
  for (const { _id, organizationId, cloudflare, convex } of rows.ci) {
    const patch = {
      cloudflare: cloudflare && {
        ...cloudflare,
        apiToken: await seal(
          cloudflare.apiToken,
          organizationCiCredentialAad(organizationId, "cloudflare.apiToken"),
        ),
      },
      convex: convex && {
        ...convex,
        accessToken: await seal(
          convex.accessToken,
          organizationCiCredentialAad(organizationId, "convex.accessToken"),
        ),
      },
    };
    await t.run(async (ctx) => await ctx.db.patch(_id, patch));
  }
  for (const { _id, userId, accessToken, refreshToken } of rows.github) {
    const patch = {
      accessToken: await seal(accessToken, githubUserAuthorizationAad(userId, "accessToken")),
      refreshToken: await seal(refreshToken, githubUserAuthorizationAad(userId, "refreshToken")),
    };
    await t.run(async (ctx) => await ctx.db.patch(_id, patch));
  }
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/**
Stubs the signing keys and the issuer that the Convex Auth core reads, for tests that mint sessions.
The key pair is new for each call, in the format of `npx @convex-dev/auth`.
*/
export async function stubConvexAuthEnv(): Promise<void> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = toBase64(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`;
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  vi.stubEnv("CONVEX_SITE_URL", "https://samebase-test.convex.site");
  vi.stubEnv("AUTH_PRIVATE_KEY", btoa(privateKeyPem));
  vi.stubEnv(
    "AUTH_JWKS",
    JSON.stringify({ keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }] }),
  );
}

/** Add the billing row that every production organization receives at creation. */
export async function insertTestOrganizationBillingAccount(
  db: DatabaseWriter,
  organizationId: Id<"organizations">,
  options?: {
    polarBillingUserId: Id<"users">;
    polarSeatQuantity: number;
  },
): Promise<void> {
  await db.insert("organizationBillingAccounts", {
    organizationId,
    plan: options ? "pro" : "free",
    status: options ? "active" : "inactive",
    ...(options
      ? {
          provider: "polar" as const,
          polarBillingUserId: options.polarBillingUserId,
          polarExternalCustomerId: `test-polar-customer-${organizationId}`,
          polarSeatQuantity: options.polarSeatQuantity,
        }
      : {}),
  });
}
