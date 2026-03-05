import { Infer, v } from "convex/values";

const { literal, object, optional, string, union } = v;

export const hostingProviderValidator = union(
  literal("netlify"),
  literal("cloudflare"),
);
export type HostingProvider = Infer<typeof hostingProviderValidator>;

export const netlifyHostingStateValidator = object({
  provider: literal("netlify"),
  siteId: string(),
  siteName: string(),
  teamId: string(),
  defaultUrl: optional(string()),
  productionUrl: optional(string()),
  buildHookId: string(),
});
export type NetlifyHostingState = Infer<typeof netlifyHostingStateValidator>;

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

export const hostingStateValidator = union(
  netlifyHostingStateValidator,
  cloudflareHostingStateValidator,
);
export type HostingState = Infer<typeof hostingStateValidator>;
