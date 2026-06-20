"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { resolveDeploymentProfile } from "./deploymentProfile";
import { Resend } from "resend";

function inferConvexDeploymentLabel(): "prod" | "dev" {
  return resolveDeploymentProfile().kind === "production" ? "prod" : "dev";
}

export const notifyAdmin = internalAction({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("RESEND_API_KEY not set, skipping waitlist notification");
      return null;
    }
    const env = inferConvexDeploymentLabel();
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "Noter Waitlist <onboarding@resend.dev>",
      to: "nicuchiciuc@gmail.com",
      subject: `[${env}] New waitlist signup: ${args.email}`,
      text: `[${env}] Someone just joined the noter waitlist: ${args.email}`,
    });
    return null;
  },
});
