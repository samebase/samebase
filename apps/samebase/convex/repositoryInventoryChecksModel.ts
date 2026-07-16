import { Infer, v } from "convex/values";

import {
  vRepositoryInventoryCheckState,
  vRepositoryInventoryCheckSummary,
} from "./repositoryInventoryModel";

const { array, id, literal, null: vNull, number, object, optional, string, union } = v;

const repositoryInventoryOrdinaryCheckFields = {
  sourceKey: string(),
  name: string(),
  state: vRepositoryInventoryCheckState,
  status: string(),
  targetUrl: optional(string()),
  updatedAt: optional(number()),
};

export const vRepositoryInventoryOrdinaryCheck = union(
  object({
    source: literal("check_run"),
    ...repositoryInventoryOrdinaryCheckFields,
    providerName: optional(string()),
    conclusion: optional(string()),
    githubUrl: optional(string()),
    startedAt: optional(number()),
    completedAt: optional(number()),
  }),
  object({
    source: literal("commit_status"),
    ...repositoryInventoryOrdinaryCheckFields,
    description: optional(string()),
  }),
);
export type RepositoryInventoryOrdinaryCheck = Infer<typeof vRepositoryInventoryOrdinaryCheck>;

export const vRepositoryInventoryChecksPage = object({
  items: array(vRepositoryInventoryOrdinaryCheck),
  totals: vRepositoryInventoryCheckSummary,
  pageSignature: string(),
  nextCursor: union(string(), vNull()),
  githubChecksUrl: string(),
});
export type RepositoryInventoryChecksPage = Infer<typeof vRepositoryInventoryChecksPage>;

export const vRepositoryInventoryChecksContext = object({
  userId: id("users"),
  repositoryNodeId: string(),
  repositoryFullName: string(),
  headSha: string(),
});
export type RepositoryInventoryChecksContext = Infer<typeof vRepositoryInventoryChecksContext>;
