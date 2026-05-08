import { Infer, v } from "convex/values";

const { literal, object, optional, string } = v;

export const cloudflareProviderValidator = literal("cloudflare");
export type CloudflareProvider = Infer<typeof cloudflareProviderValidator>;

export const cloudflareStateValidator = object({
  provider: literal("cloudflare"),
  accountId: string(),
  projectName: string(),
  subdomain: optional(string()),
  productionUrl: optional(string()),
});
export type CloudflareState = Infer<typeof cloudflareStateValidator>;
