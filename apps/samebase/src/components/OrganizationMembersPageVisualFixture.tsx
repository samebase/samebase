import {
  OrganizationMembersPageView,
  type OrganizationInvitationId,
  type OrganizationMembersPageData,
} from "@/components/OrganizationMembersPageView";
import type { Id } from "../../convex/_generated/dataModel";

export type OrganizationMembersPageVisualMode = "organization-members-page-owner";

function fakeId<TableName extends "organizationMemberships" | "organizations" | "users">(
  value: string,
): Id<TableName> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only needs stable values.
  return value;
}

function fakeInvitationId(value: string): OrganizationInvitationId {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only needs a stable value.
  return value;
}

const page = {
  members: [
    {
      githubLogin: "nicu",
      isBillingPayer: true,
      isDeleting: false,
      isOnlyActiveOwner: true,
      isPersonalGithubOwnerIdentity: false,
      isViewer: true,
      label: "Nicu",
      membershipId: fakeId("membership_nicu"),
      role: "owner",
      userId: fakeId("user_nicu"),
    },
    {
      githubLogin: "noter-guest",
      isBillingPayer: false,
      isDeleting: false,
      isOnlyActiveOwner: false,
      isPersonalGithubOwnerIdentity: false,
      isViewer: false,
      label: "Noter Guest",
      membershipId: fakeId("membership_noter_guest"),
      role: "member",
      userId: fakeId("user_noter_guest"),
    },
    {
      githubLogin: "ava-chen",
      isBillingPayer: false,
      isDeleting: false,
      isOnlyActiveOwner: false,
      isPersonalGithubOwnerIdentity: false,
      isViewer: false,
      label: "Ava Chen",
      membershipId: fakeId("membership_ava"),
      role: "member",
      userId: fakeId("user_ava"),
    },
  ],
  organization: {
    githubOwnerLogin: "samebase",
    githubOwnerType: "organization",
    organizationId: fakeId("organization_samebase"),
  },
  pendingInvitations: [
    {
      code: "fixture-invitation-code",
      createdBy: { kind: "displayName", label: "Nicu" },
      createdAt: Date.UTC(2026, 7, 10),
      expiresAt: Date.UTC(2026, 7, 17),
      githubLogin: "maya",
      invitationId: fakeInvitationId("invitation_maya"),
    },
  ],
  viewerRole: "owner",
} satisfies OrganizationMembersPageData;

const resolveTarget = () =>
  Promise.resolve({
    expectedGithubAccountId: "github-account-maya",
    githubLogin: "maya",
    relationship: "organization_member" as const,
  });

const createInvitation = () =>
  Promise.resolve({
    code: "fixture-invitation-code",
    expiresAt: Date.UTC(2026, 7, 17),
    githubLogin: "maya",
    invitationId: fakeInvitationId("invitation_maya"),
    state: "existing" as const,
  });

const completeAction = () => Promise.resolve(null);

export function OrganizationMembersPageVisualFixture() {
  return (
    <OrganizationMembersPageView
      githubRelationships={[
        { status: "organization_owner", userId: fakeId("user_nicu") },
        { status: "organization_member", userId: fakeId("user_noter_guest") },
        { status: "not_in_organization", userId: fakeId("user_ava") },
      ]}
      onCancelInvitation={completeAction}
      onChangeRole={completeAction}
      onCreateInvitation={createInvitation}
      onLeaveOrganization={completeAction}
      onRemoveMember={completeAction}
      onResolveInvitationTarget={resolveTarget}
      page={page}
    />
  );
}
