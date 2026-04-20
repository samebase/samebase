export const NOTER_CREATE_COMPONENT_NAME = "noterCreate";

export const REQUIRED_CREATE_PROVIDER_KINDS = [
  "github",
  "convex",
  "cloudflare",
] as const;

export type NoterCreateProviderKind =
  (typeof REQUIRED_CREATE_PROVIDER_KINDS)[number];
