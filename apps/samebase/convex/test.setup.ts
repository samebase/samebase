/// <reference types="vite/client" />

import workflowTest from "@convex-dev/workflow/test";
import { register as registerEmailInbox } from "@samebase/convex-cloudflare-email-inbox/test";
import { convexTest } from "convex-test";

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
  return t;
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
