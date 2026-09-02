import { useAppAuthActions } from "@/authClient";
import { OrganizationInvitationPageView } from "@/components/OrganizationInvitationPageView";
import { ORGANIZATION_REPOSITORIES_ROUTE } from "@/lib/organizationRoutes";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function OrganizationInvitationPage({ code }: { code: string }) {
  const getInvitation = useAction(api.organizationMembers.getInvitation);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const invitationQuery = useQuery({
    enabled: !isLoading,
    queryFn: async () => await getInvitation({ code }),
    queryKey: ["organization-invitation", code, isAuthenticated],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const acceptInvitation = useMutation(api.organizationMembers.acceptInvitation);
  const { signOut } = useAppAuthActions();
  const navigate = useNavigate();

  if (invitationQuery.isError && invitationQuery.data === undefined) {
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
          to: ORGANIZATION_REPOSITORIES_ROUTE,
        });
      }}
      onSignOut={signOut}
    />
  );
}
