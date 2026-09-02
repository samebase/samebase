import { v } from "convex/values";

const { number, object, string } = v;

/**
 * Stable event order across the table migration.
 *
 * Copied rows keep the source document's `_creationTime` and `_id`. New rows
 * create a stable document key before insertion.
 */
export const vRepositoryEventSourceOrder = object({
  creationTime: number(),
  documentId: string(),
});
