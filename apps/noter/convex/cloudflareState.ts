import { Infer, v } from "convex/values";

const { object, optional, string } = v;

export const vCloudflareState = object({
  accountId: string(),
  projectName: string(),
  subdomain: optional(string()),
  productionUrl: optional(string()),
});
export type CloudflareState = Infer<typeof vCloudflareState>;
