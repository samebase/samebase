import { Infer, v } from "convex/values";
import { z } from "zod";

import { env, internalAction } from "./_generated/server";
import { resolveDeploymentProfile, type DeploymentProfile } from "./deploymentProfile";

const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";
const EMAIL_FROM = {
  address: "notifications@samebase.com",
  name: "Samebase",
};
const { null: vNull, object, string } = v;

export const vSendEmailArgs = object({
  to: string(),
  subject: string(),
  text: string(),
});
export type SendEmailArgs = Infer<typeof vSendEmailArgs>;

const cloudflareEmailResponseSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    result: z.object({
      delivered: z.array(z.string()),
      message_id: z.string(),
      permanent_bounces: z.array(z.string()),
      queued: z.array(z.string()),
    }),
  }),
  z.object({
    success: z.literal(false),
    errors: z.array(
      z.object({
        code: z.union([z.number(), z.string()]),
        message: z.string(),
      }),
    ),
  }),
]);

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

export const send = internalAction({
  args: vSendEmailArgs,
  returns: vNull(),
  handler: async (_ctx, args) => {
    const token = env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
    const accountId = env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim();
    const deploymentProfile = resolveDeploymentProfile();

    if (!token && !accountId) {
      if (
        deploymentProfile.kind === "local_development" ||
        deploymentProfile.kind === "local_worktree"
      ) {
        return null;
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

    const response = await fetch(
      `${CLOUDFLARE_API_BASE_URL}/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: args.to,
          from: EMAIL_FROM,
          subject: formatSubject(args.subject, deploymentProfile),
          text: args.text,
        }),
      },
    );
    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Cloudflare Email Sending returned a non-JSON response (${response.status}).`,
      );
    }
    const result = cloudflareEmailResponseSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(
        `Cloudflare Email Sending returned an invalid response (${response.status}): ${z.prettifyError(result.error)}`,
      );
    }
    if (!result.data.success) {
      const details = result.data.errors
        .map((error) => `${error.code}: ${error.message}`)
        .join("; ");
      throw new Error(`Cloudflare Email Sending failed (${response.status}): ${details}`);
    }
    if (!response.ok) {
      throw new Error(`Cloudflare Email Sending failed (${response.status}).`);
    }
    if (result.data.result.permanent_bounces.length > 0) {
      throw new Error(
        `Cloudflare Email Sending permanently bounced for ${result.data.result.permanent_bounces.length} recipient(s).`,
      );
    }
    return null;
  },
});
