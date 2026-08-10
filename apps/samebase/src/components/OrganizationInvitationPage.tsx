import { useAppAuthActions } from "@/authClient";
import { OrganizationInvitationPageView } from "@/components/OrganizationInvitationPageView";
import { ORGANIZATION_VAULTS_ROUTE } from "@/lib/organizationRoutes";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export function OrganizationInvitationPage({ code }: { code: string }) {
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const invitation = useQuery(api.organizationMembers.getInvitation, { code, now });
  const acceptInvitation = useMutation(api.organizationMembers.acceptInvitation);
  const { signOut } = useAppAuthActions();
  const navigate = useNavigate();

  if (invitation === undefined) {
    return null;
  }

  return (
    <OrganizationInvitationPageView
      invitation={invitation}
      onJoin={async () => {
        const result = await acceptInvitation({ code });
        await navigate({
          params: { owner: result.organizationOwnerLogin },
          to: ORGANIZATION_VAULTS_ROUTE,
        });
      }}
      onSignOut={signOut}
    />
  );
}
