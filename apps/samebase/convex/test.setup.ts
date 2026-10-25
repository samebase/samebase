/// <reference types="vite/client" />

import { registerCore } from "@convex-dev/auth/test";
import { registerGithubOauth } from "@convex-dev/auth/components/github/test";
import { registerGoogleOauth } from "@convex-dev/auth/components/google/test";
import { registerPasswordProvider } from "@convex-dev/auth/components/password/test";
import workflowTest from "@convex-dev/workflow/test";
import { register as registerEmailInbox } from "@samebase/convex-cloudflare-email-inbox/test";
import { register as registerGitWorkspace } from "@samebase/git-workspace/test";
import { convexTest } from "convex-test";
import { vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./**/*.convex.test.ts",
  "!./**/*.generated.ts",
  "!./test.setup.ts",
]);

/**
 * Create an isolated Convex test backend with the same components installed as
 * the app so contract tests exercise registered functions through real refs.
 */
export function makeConvexTest() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  registerEmailInbox(t, "mail");
  registerGitWorkspace(t, "gitWorkspace");
  registerCore(t);
  registerGithubOauth(t);
  registerGoogleOauth(t);
  registerPasswordProvider(t);
  return t;
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
