import { Infer, v } from "convex/values";

const { object, optional, string } = v;

export const vCloudflareState = object({
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  // Deprecated: accepted until old preview/dev rows are cleaned up.
  accountSubdomain: optional(string()),
  productionUrl: optional(string()),
  // Deprecated: trigger ids are rediscovered from workerTag when deleting.
  productionTriggerUuid: optional(string()),
  previewTriggerUuid: optional(string()),
});
export type CloudflareState = Infer<typeof vCloudflareState>;
