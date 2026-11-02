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
    const identity = await ctx.runQuery(internal.accountDeletion.stepContext.getOwnedIdentity, {
      runId: args.runId,
      workflowId: args.workflowId,
    });
    try {
      const delivery = await sendEmail(ctx, {
        to: identity.email,
        subject: "Your Samebase account deletion is finishing",
        text: `Your Samebase workspace data and stored provider credentials have been removed. Your remaining sign-in records are being finalized. Samebase staff will finish the deletion if the last step needs attention.

External repositories, deployments, projects, and Workers were not deleted.

If you connected Convex with OAuth, the production and preview deploy keys already issued to your apps stay valid, so those apps keep deploying.

If you connected Cloudflare with OAuth, revoke Samebase in Cloudflare Connected Applications to remove upstream access.

Deletion reference: ${args.runId}`,
      });
      if (!delivery.ok) {
        return {
          state: "delivery_failed",
          safeError: COMPLETION_EMAIL_SAFE_ERROR,
        } as const;
      }
      if (delivery.value === "queued") {
        return {
          state: "delivery_failed",
          safeError:
            "Completion email is queued for automatic delivery. Delivery is not yet confirmed.",
        } as const;
      }
      return { state: "sent" } as const;
    } catch {
      return {
        state: "delivery_failed",
        safeError: COMPLETION_EMAIL_SAFE_ERROR,
      } as const;
    }
  },
});
