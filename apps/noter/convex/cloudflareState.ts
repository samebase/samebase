import { Infer, v } from "convex/values";

const { object, optional, string } = v;

export const vCloudflareState = object({
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  productionUrl: optional(string()),
});
export type CloudflareState = Infer<typeof vCloudflareState>;
