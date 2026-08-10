import type {
  CreatedOrganizationInvitation,
  InvitationTarget,
  MemberGitHubRelationship,
  OrganizationInvitationId,
  OrganizationMemberRole,
  OrganizationMembersPageData,
} from "@/components/OrganizationMembersPageView";
import type { Id } from "../../convex/_generated/dataModel";
import { makeFunctionReference } from "convex/server";

export type OrganizationInvitationResult =
  | {
      isAcceptedByViewer: boolean;
      organizationOwnerLogin: string;
      state: "accepted";
      targetLogin: string;
    }
  | {
      organizationOwnerLogin: string;
      state: "available";
      targetAvatarUrl?: string;
      targetLogin: string;
      viewerState: "signed_out" | "can_accept" | "wrong_github_account" | "already_member";
    }
  | { state: "unavailable" };

export const getOrganizationMembersPage = makeFunctionReference<
  "query",
  { now: number; organizationId: Id<"organizations"> },
  OrganizationMembersPageData
>("organizationMembers:getPage");

export const getOrganizationMemberGitHubRelationships = makeFunctionReference<
  "action",
  { organizationId: Id<"organizations"> },
  MemberGitHubRelationship[]
>("organizationMembers:getGitHubRelationships");

export const resolveOrganizationInvitationTarget = makeFunctionReference<
  "action",
  { githubLogin: string; organizationId: Id<"organizations"> },
  InvitationTarget
>("organizationMembers:resolveInvitationTarget");

export const createOrganizationInvitation = makeFunctionReference<
  "action",
  {
    expectedGithubAccountId: string;
    githubLogin: string;
    organizationId: Id<"organizations">;
  },
  CreatedOrganizationInvitation
>("organizationMembers:createInvitation");

export const cancelOrganizationInvitation = makeFunctionReference<
  "mutation",
  { invitationId: OrganizationInvitationId; organizationId: Id<"organizations"> },
  null
>("organizationMembers:cancelInvitation");

export const changeOrganizationMemberRole = makeFunctionReference<
  "mutation",
  {
    membershipId: Id<"organizationMemberships">;
    organizationId: Id<"organizations">;
    role: OrganizationMemberRole;
  },
  null
>("organizationMembers:changeRole");

export const removeOrganizationMember = makeFunctionReference<
  "mutation",
  { membershipId: Id<"organizationMemberships">; organizationId: Id<"organizations"> },
  null
>("organizationMembers:removeMember");

export const leaveOrganizationMembership = makeFunctionReference<
  "mutation",
  { organizationId: Id<"organizations"> },
  null
>("organizationMembers:leaveOrganization");

export const getOrganizationInvitation = makeFunctionReference<
  "query",
  { code: string; now: number },
  OrganizationInvitationResult
>("organizationMembers:getInvitation");

export const acceptOrganizationInvitation = makeFunctionReference<
  "mutation",
  { code: string },
  {
    organizationOwnerLogin: string;
    state: "joined" | "already_member" | "already_accepted";
  }
>("organizationMembers:acceptInvitation");
