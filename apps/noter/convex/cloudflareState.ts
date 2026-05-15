import { Infer, v } from "convex/values";

const { object, optional, string } = v;

export const vCloudflareState = object({
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  accountSubdomain: optional(string()),
  productionUrl: optional(string()),
  productionTriggerUuid: optional(string()),
  previewTriggerUuid: optional(string()),
});
export type CloudflareState = Infer<typeof vCloudflareState>;
