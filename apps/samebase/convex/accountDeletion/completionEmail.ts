import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { sendEmail } from "../email";
import { internal } from "../_generated/api";

const { id, literal, object, string } = v;

const vCompletionEmailResult = v.union(
  object({ state: literal("sent") }),
  object({ state: literal("delivery_failed"), safeError: string() }),
);

const COMPLETION_EMAIL_SAFE_ERROR = "Completion email delivery could not be confirmed.";

export const sendForAccountDeletion = internalAction({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: vCompletionEmailResult,
  handler: async (ctx, args) => {
    const identity = await ctx.runQuery(
      internal.accountDeletion.stepContext.getOwnedIdentity,
      args,
    );
    try {
      await sendEmail({
        to: identity.email,
        subject: "Your Samebase account deletion is finishing",
        text: `Your Samebase workspace data and stored provider credentials have been removed. Your remaining sign-in records are being finalized. Samebase staff will finish the deletion if the last step needs attention.

External repositories, deployments, projects, and Workers were not deleted.

If you connected Convex with OAuth, revoke Samebase in Convex Authorized Applications to invalidate previously issued production and preview deploy keys.

If you connected Cloudflare with OAuth, revoke Samebase in Cloudflare Connected Applications to remove upstream access.

Deletion reference: ${args.runId}`,
      });
      return { state: "sent" } as const;
    } catch {
      return {
        state: "delivery_failed",
        safeError: COMPLETION_EMAIL_SAFE_ERROR,
      } as const;
    }
  },
});
