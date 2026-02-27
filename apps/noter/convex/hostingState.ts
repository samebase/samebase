import { Infer, v } from "convex/values";

const { literal, object, optional, string, union } = v;

export const hostingProviderValidator = union(
  literal("netlify"),
  literal("railway"),
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

export const railwayHostingStateValidator = object({
  provider: literal("railway"),
  projectId: string(),
  environmentId: string(),
  serviceId: string(),
  domain: string(),
});
export type RailwayHostingState = Infer<typeof railwayHostingStateValidator>;

export const hostingStateValidator = union(
  netlifyHostingStateValidator,
  railwayHostingStateValidator,
);
export type HostingState = Infer<typeof hostingStateValidator>;
