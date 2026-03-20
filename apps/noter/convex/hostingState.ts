import { Infer, v } from "convex/values";

const { literal, object, optional, string } = v;

export const hostingProviderValidator = literal("cloudflare");
export type HostingProvider = Infer<typeof hostingProviderValidator>;

export const cloudflareHostingStateValidator = object({
  provider: literal("cloudflare"),
  accountId: string(),
  projectName: string(),
  subdomain: optional(string()),
  productionUrl: optional(string()),
});
export type CloudflareHostingState = Infer<
  typeof cloudflareHostingStateValidator
>;

export const hostingStateValidator = cloudflareHostingStateValidator;
export type HostingState = Infer<typeof hostingStateValidator>;
