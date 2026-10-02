import { Infer, v } from "convex/values";
import { EmailInbox } from "@samebase/convex-cloudflare-email-inbox";

import { components } from "./_generated/api";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import { resolveDeploymentProfile, type DeploymentProfile } from "./deploymentProfile";

const inbox = new EmailInbox(components.mail, {
  defaultInbox: {
    address: "notifications@samebase.com",
    label: "Samebase notifications",
    senderName: "Samebase",
  },
});
const { object, string } = v;

export const vSendEmailArgs = object({
  to: string(),
  subject: string(),
  text: string(),
});
export type SendEmailArgs = Infer<typeof vSendEmailArgs>;

function formatSubject(subject: string, deploymentProfile: DeploymentProfile): string {
  switch (deploymentProfile.kind) {
    case "production":
      return subject;
    case "preview":
      return `[Preview] ${subject}`;
    case "convex_dev":
    case "local_development":
    case "local_worktree":
      return `[Development] ${subject}`;
    default:
      deploymentProfile satisfies never;
      return subject;
  }
}

export async function sendEmail(
  ctx: ActionCtx,
  args: SendEmailArgs,
): Promise<"accepted" | "queued" | "skipped"> {
  const token = env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  const accountId = env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim();
  const deploymentProfile = resolveDeploymentProfile();

  if (!token && !accountId) {
    if (
      deploymentProfile.kind === "local_development" ||
      deploymentProfile.kind === "local_worktree"
    ) {
      return "skipped";
    }
    throw new Error(
      "CLOUDFLARE_EMAIL_API_TOKEN and CLOUDFLARE_EMAIL_ACCOUNT_ID are required for deployed email sending.",
    );
  }
  if (!token || !accountId) {
    throw new Error(
      "CLOUDFLARE_EMAIL_API_TOKEN and CLOUDFLARE_EMAIL_ACCOUNT_ID must be configured together.",
    );
  }

  const delivery = await inbox.send(ctx, {
    to: [args.to],
    subject: formatSubject(args.subject, deploymentProfile),
    text: args.text,
    idempotencyKey: crypto.randomUUID(),
  });
  switch (delivery.kind) {
    case "accepted": {
      const recipientResults = delivery.recipientResults;
      if (recipientResults && recipientResults.permanent_bounces.length > 0) {
        throw new Error(
          `Cloudflare Email Sending permanently bounced for ${recipientResults.permanent_bounces.length} recipient(s).`,
        );
      }
      if (recipientResults && (recipientResults.suppressed_recipients?.length ?? 0) > 0) {
        throw new Error("Cloudflare Email Sending suppressed the recipient.");
      }
      return "accepted";
    }
    case "rejected":
      throw new Error(`Cloudflare Email Sending rejected the request (${delivery.code}).`);
    case "queued":
    case "sending":
      return "queued";
    case "unknown":
      throw new Error("Cloudflare Email Sending delivery could not be confirmed.");
    default:
      delivery satisfies never;
      throw new Error("Cloudflare Email Sending delivery could not be confirmed.");
  }
}

export const send = internalAction({
  args: vSendEmailArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await sendEmail(ctx, args);
    return null;
  },
});
