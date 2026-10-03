import { v } from "convex/values";

/** MCP tools take the repository by name or ID; the dashboard passes `repositoryId`. */
export const mcpRepositoryArgs = {
  repository: v.string(),
};

export const MCP_REPOSITORY_INPUT_DESCRIPTION =
  "The repository as GitHub owner/name, or its repositoryId from repository_list.";
