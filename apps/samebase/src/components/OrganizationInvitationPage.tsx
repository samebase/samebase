import { useAppAuthActions } from "@/authClient";
import { OrganizationInvitationPageView } from "@/components/OrganizationInvitationPageView";
import { ORGANIZATION_VAULTS_ROUTE } from "@/lib/organizationRoutes";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function OrganizationInvitationPage({ code }: { code: string }) {
  const getInvitation = useAction(api.organizationMembers.getInvitation);
  const invitationQuery = useQuery({
    queryFn: async () => await getInvitation({ code }),
    queryKey: ["organization-invitation", code],
    refetchOnMount: "always",
    retry: 1,
  });
  const acceptInvitation = useMutation(api.organizationMembers.acceptInvitation);
  const { signOut } = useAppAuthActions();
  const navigate = useNavigate();

  if (invitationQuery.isError) {
    throw invitationQuery.error;
  }
  if (invitationQuery.data === undefined) {
    return null;
  }

  return (
    <OrganizationInvitationPageView
      invitation={invitationQuery.data}
      onJoin={async () => {
        const result = await acceptInvitation({ code });
        await navigate({
          params: { owner: result.organizationOwnerLogin },
          to: ORGANIZATION_VAULTS_ROUTE,
        });
      }}
      onSignOut={async () => {
        await signOut();
        await invitationQuery.refetch();
      }}
    />
  );
}
