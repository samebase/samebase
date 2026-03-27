"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { Resend } from "resend";

const { null: nullValidator, optional, string } = v;

function inferConvexDeploymentLabel(): "prod" | "dev" {
  const convexDeployment = process.env.CONVEX_DEPLOYMENT?.trim() ?? "";
  const deploymentPrefix =
    convexDeployment.split(":")[0]?.trim().toLowerCase() ?? "";
  if (deploymentPrefix === "prod") {
    return "prod";
  }
  if (deploymentPrefix === "dev" || deploymentPrefix === "preview") {
    return "dev";
  }
  return "dev";
}

export const notifyAdmin = internalAction({
  args: {
    email: optional(string()),
    message: string(),
  },
  returns: nullValidator(),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        "RESEND_API_KEY not set, skipping public landing intake notification",
      );
      return null;
    }
    const env = inferConvexDeploymentLabel();
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "Noter Landing <onboarding@resend.dev>",
      to: "nicuchiciuc@gmail.com",
      subject: args.email
        ? `[${env}] New noter landing note from ${args.email}`
        : `[${env}] New anonymous noter landing note`,
      text: [
        `[${env}] New noter landing submission`,
        "",
        `Email: ${args.email ?? "(not provided)"}`,
        "",
        "Message:",
        args.message,
      ].join("\n"),
    });
    return null;
  },
});
