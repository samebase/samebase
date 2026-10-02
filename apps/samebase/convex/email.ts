import { Infer, v } from "convex/values";
import { EmailInbox } from "@samebase/convex-cloudflare-email-inbox";
import { AbortError, createRun, err, ok, type Result } from "@evolu/common";

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
const vSendEmailResult = union(
  object({ ok: literal(true), value: vSendEmailStatus }),
  object({ ok: literal(false), error: vSendEmailFailure }),
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
  // Convex owns request failures. The catch below rethrows Task defects in this request.
  const run = createRun({ reportDefect: () => {} });
  try {
    return await run(async (): Promise<SendEmailResult> => {
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
    });
  } catch (error) {
    if (AbortError.is(error) && error.reason.type === "PanicAbortReason") {
      throw error.reason["defect"];
    }
    throw error;
  } finally {
    await run[Symbol.asyncDispose]();
  }
}

export const send = internalAction({
  args: vSendEmailArgs,
  returns: vSendEmailResult,
  handler: sendEmail,
});
