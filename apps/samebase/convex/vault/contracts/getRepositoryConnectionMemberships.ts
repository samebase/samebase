import { v } from "convex/values";

const { array, boolean, null: nullValue, number, object, string, union } = v;

export const vRepositoryConnectionMembershipInput = object({
  githubRepositoryId: union(number(), nullValue()),
  repositoryFullName: string(),
});

export const vRepositoryConnectionMembership = object({
  repositoryFullName: string(),
  connected: boolean(),
});

export const getRepositoryConnectionMembershipsContract = {
  access: "access_repo_connect",
  args: {
    repositories: array(vRepositoryConnectionMembershipInput),
  },
  returns: array(vRepositoryConnectionMembership),
} as const;
