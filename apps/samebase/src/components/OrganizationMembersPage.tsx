import { OrganizationMembersPageView } from "@/components/OrganizationMembersPageView";
import type { ViewerOrganization } from "@/lib/organizationContext";
import {
  cancelOrganizationInvitation,
  changeOrganizationMemberRole,
  createOrganizationInvitation,
  getOrganizationMemberGitHubRelationships,
  getOrganizationMembersPage,
  leaveOrganizationMembership,
  removeOrganizationMember,
  resolveOrganizationInvitationTarget,
} from "@/lib/organizationMembersApi";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import { useState } from "react";

export function OrganizationMembersPage({ organization }: { organization: ViewerOrganization }) {
  const organizationId = organization.organizationId;
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const page = useConvexQuery(getOrganizationMembersPage, { now, organizationId });
  const getGitHubRelationships = useAction(getOrganizationMemberGitHubRelationships);
  const resolveInvitationTarget = useAction(resolveOrganizationInvitationTarget);
  const createInvitation = useAction(createOrganizationInvitation);
  const cancelInvitation = useMutation(cancelOrganizationInvitation);
  const changeRole = useMutation(changeOrganizationMemberRole);
  const removeMember = useMutation(removeOrganizationMember);
  const leaveOrganization = useMutation(leaveOrganizationMembership);
  const githubRelationships = useQuery({
    enabled: page?.viewerRole === "owner",
    queryFn: async () => await getGitHubRelationships({ organizationId }),
    queryKey: ["organization-member-github-relationships", organizationId],
    refetchOnMount: "always",
    retry: 1,
  });

  if (page === undefined) {
    return null;
  }

  return (
    <OrganizationMembersPageView
      githubRelationships={
        page.viewerRole === "owner"
          ? githubRelationships.isError
            ? null
            : githubRelationships.data
          : []
      }
      onCancelInvitation={async (invitationId) =>
        await cancelInvitation({ invitationId, organizationId })
      }
      onChangeRole={async (membershipId, role) =>
        await changeRole({ membershipId, organizationId, role })
      }
      onCreateInvitation={async ({ expectedGithubAccountId, githubLogin }) =>
        await createInvitation({
          expectedGithubAccountId,
          githubLogin,
          organizationId,
        })
      }
      onLeaveOrganization={async () => await leaveOrganization({ organizationId })}
      onRemoveMember={async (membershipId) => await removeMember({ membershipId, organizationId })}
      onResolveInvitationTarget={async (githubLogin) =>
        await resolveInvitationTarget({ githubLogin, organizationId })
      }
      page={page}
    />
  );
}
