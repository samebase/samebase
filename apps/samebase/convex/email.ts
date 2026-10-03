import { Infer, v } from "convex/values";
import { EmailInbox } from "@samebase/convex-cloudflare-email-inbox";
import { err, ok, type Result } from "@evolu/common";

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
const { literal, object, string, union } = v;

export const vSendEmailArgs = object({
  to: string(),
  subject: string(),
  text: string(),
});
export type SendEmailArgs = Infer<typeof vSendEmailArgs>;

const vSendEmailStatus = union(literal("accepted"), literal("queued"), literal("skipped"));
const vSendEmailFailure = union(
  literal("bounced"),
  literal("suppressed"),
  literal("rejected"),
  literal("unknown"),
);
type SendEmailResult = Result<Infer<typeof vSendEmailStatus>, Infer<typeof vSendEmailFailure>>;

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

export async function sendEmail(ctx: ActionCtx, args: SendEmailArgs): Promise<SendEmailResult> {
  const token = env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  const accountId = env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim();
  const deploymentProfile = resolveDeploymentProfile();

  if (!token && !accountId) {
    if (
      deploymentProfile.kind === "local_development" ||
      deploymentProfile.kind === "local_worktree"
    ) {
      return ok("skipped");
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
        return err("bounced");
      }
      if (recipientResults && (recipientResults.suppressed_recipients?.length ?? 0) > 0) {
        return err("suppressed");
      }
      return ok("accepted");
    }
    case "rejected":
      return err("rejected");
    case "queued":
    case "sending":
      return ok("queued");
    case "unknown":
      return err("unknown");
    default:
      delivery satisfies never;
      throw new Error("Cloudflare Email Sending delivery could not be confirmed.");
  }
}

export const send = internalAction({
  args: vSendEmailArgs,
  returns: object({ ok: literal(true), value: vSendEmailStatus }),
  handler: async (ctx, args) => {
    const result = await sendEmail(ctx, args);
    if (!result.ok) {
      throw new Error(
        `Email sending was not confirmed: ${result.error}. Check delivery history before retrying.`,
      );
    }
    return result;
  },
});
