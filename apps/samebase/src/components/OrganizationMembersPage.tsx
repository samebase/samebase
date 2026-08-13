import { OrganizationMembersPageView } from "@/components/OrganizationMembersPageView";
import { useNow } from "@/hooks/useNow";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function OrganizationMembersPage({ organization }: { organization: ViewerOrganization }) {
  const organizationId = organization.organizationId;
  const now = Math.floor(useNow({ intervalMs: 60_000 }) / 60_000) * 60_000;
  const pageQuery = useQuery({
    ...convexQuery(api.organizationMembers.getPage, { now, organizationId }),
    placeholderData: (previousPage) =>
      previousPage?.organization.organizationId === organizationId ? previousPage : undefined,
  });
  if (pageQuery.isError) {
    throw pageQuery.error;
  }
  const page = pageQuery.data;
  const getGitHubRelationships = useAction(api.organizationMembers.getGitHubRelationships);
  const resolveInvitationTarget = useAction(api.organizationMembers.resolveInvitationTarget);
  const createInvitation = useAction(api.organizationMembers.createInvitation);
  const cancelInvitation = useMutation(api.organizationMembers.cancelInvitation);
  const changeRole = useMutation(api.organizationMembers.changeRole);
  const removeMember = useMutation(api.organizationMembers.removeMember);
  const leaveOrganization = useMutation(api.organizationMembers.leaveOrganization);
  const transferBillingPayer = useAction(api.billing.transferPolarBillingPayer);
  const githubRelationships = useQuery({
    enabled: page?.viewerRole === "owner",
    queryFn: async () => await getGitHubRelationships({ organizationId }),
    queryKey: [
      "organization-member-github-relationships",
      organizationId,
      page?.members.map((member) => `${member.userId}:${member.githubLogin ?? ""}`).join(",") ?? "",
    ],
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
      onTransferBillingPayer={async (targetMembershipId) =>
        await transferBillingPayer({ organizationId, targetMembershipId })
      }
      page={page}
    />
  );
}
