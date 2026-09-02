import { v } from "convex/values";

const { number, object, string } = v;

/** Stable event order using the original creation time and document identifier. */
export const vRepositoryEventSourceOrder = object({
  creationTime: number(),
  documentId: string(),
});
