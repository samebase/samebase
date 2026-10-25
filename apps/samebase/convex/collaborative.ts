import { v, type Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { mutation, query } from "./functions";
import { findRepositoryForUser } from "./organizationAccess";
import { assertConnectedRepository } from "./repository/state";

const { array, boolean, id, number, object, string } = v;
const pulledUpdates = array(
  object({ clientID: string(), changes: string(), version: number(), userId: string() }),
);
const pushResult = object({ success: boolean(), newVersion: number() });

export const pullUpdates = query({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: string(),
    branch: string(),
    filePath: string(),
    version: number(),
  },
  returns: pulledUpdates,
  handler: async (ctx, args): Promise<Infer<typeof pulledUpdates>> => {
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId: ctx.viewer.userId,
      branch: args.branch,
    });
    if (!repository) throw new Error("Repository not found");
    return await ctx.runQuery(components.gitWorkspace.collaborative.pullUpdates, {
      repositoryId: repository.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      version: args.version,
    });
  },
});
export const pushUpdates = mutation({
  access: "access_files_write",
  args: {
    githubRepositoryFullName: string(),
    branch: string(),
    filePath: string(),
    version: number(),
    updates: array(object({ clientId: string(), changes: string() })),
  },
  returns: pushResult,
  handler: async (ctx, args): Promise<Infer<typeof pushResult>> => {
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId: ctx.viewer.userId,
      branch: args.branch,
    });
    if (!repository) throw new Error("Repository not found");
    return await ctx.runMutation(components.gitWorkspace.collaborative.pushUpdates, {
      repositoryId: repository.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      version: args.version,
      updates: args.updates,
      userId: ctx.viewer.userId,
    });
  },
});
export const pushContentUpdate = internalMutation({
  args: {
    repositoryId: id("repositories"),
    filePath: string(),
    branch: string(),
    expectedVersion: number(),
    newContent: string(),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repository = await findRepositoryForUser(ctx.db, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    assertConnectedRepository(repository);
    return await ctx.runMutation(components.gitWorkspace.collaborative.pushContentUpdate, {
      repositoryId: args.repositoryId,
      filePath: args.filePath,
      branch: args.branch,
      expectedVersion: args.expectedVersion,
      newContent: args.newContent,
      userId: args.userId,
    });
  },
});
