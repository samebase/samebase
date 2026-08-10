import { Button } from "@/components/ui/button";
import type { GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { ORGANIZATION_VAULTS_ROUTE } from "@/lib/organizationRoutes";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";

type OrganizationInvitationResult = GetFunctionReferenceReturnType<
  typeof api.organizationMembers.getInvitation
>;

function InvitationPageFrame({ children }: { children: ReactNode }) {
  return (
    <main
      className="container my-auto w-full max-w-xl py-16"
      data-posthog-block
      data-testid="organization-invitation-page"
    >
      <div className="flex flex-col items-start gap-4">{children}</div>
    </main>
  );
}

function OpenOrganizationLink({ owner }: { owner: string }) {
  return (
    <Button asChild>
      <Link params={{ owner }} to={ORGANIZATION_VAULTS_ROUTE}>
        Open organization
      </Link>
    </Button>
  );
}

export function OrganizationInvitationPageView({
  invitation,
  onJoin,
  onSignOut,
}: {
  invitation: OrganizationInvitationResult;
  onJoin: () => Promise<unknown>;
  onSignOut: () => Promise<unknown>;
}) {
  const [pendingAction, setPendingAction] = useState<"join" | "sign-out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (invitation.state === "unavailable") {
    return (
      <InvitationPageFrame>
        <h1 className="text-xl font-semibold @2xl:text-2xl">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">This invitation expired or was canceled.</p>
      </InvitationPageFrame>
    );
  }

  if (invitation.state === "accepted") {
    if (!invitation.isAcceptedByViewer) {
      return (
        <InvitationPageFrame>
          <h1 className="text-xl font-semibold @2xl:text-2xl">Invitation unavailable</h1>
          <p className="text-sm text-muted-foreground">This invitation has already been used.</p>
        </InvitationPageFrame>
      );
    }

    if (!invitation.isViewerMember) {
      return (
        <InvitationPageFrame>
          <h1 className="text-xl font-semibold @2xl:text-2xl">Invitation already used</h1>
          <p className="text-sm text-muted-foreground">
            Ask a Samebase owner for a new invitation.
          </p>
        </InvitationPageFrame>
      );
    }

    return (
      <InvitationPageFrame>
        <h1 className="text-xl font-semibold @2xl:text-2xl">Invitation accepted</h1>
        <p className="text-sm text-muted-foreground">
          You are a Samebase member of @{invitation.organizationOwnerLogin}.
        </p>
        <OpenOrganizationLink owner={invitation.organizationOwnerLogin} />
      </InvitationPageFrame>
    );
  }

  const runJoin = () => {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction("join");
    setError(null);
    void onJoin().catch((joinError: unknown) => {
      setError(joinError instanceof Error ? joinError.message : "Could not join. Try again.");
      setPendingAction(null);
    });
  };

  const runSignOut = () => {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction("sign-out");
    setError(null);
    void onSignOut().catch(() => {
      setError("Could not sign out. Try again.");
      setPendingAction(null);
    });
  };

  return (
    <InvitationPageFrame>
      <div>
        <h1 className="text-xl font-semibold @2xl:text-2xl">
          Join @{invitation.organizationOwnerLogin} on Samebase
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation is for @{invitation.targetLogin}.
        </p>
      </div>
      {invitation.targetAvatarUrl ? (
        <img
          alt=""
          className="size-12 rounded-full bg-muted object-cover"
          height={48}
          src={invitation.targetAvatarUrl}
          width={48}
        />
      ) : null}
      {invitation.viewerState === "signed_out" ? (
        <p className="text-sm text-muted-foreground">
          Sign in with @{invitation.targetLogin} on GitHub from the account sidebar.
        </p>
      ) : invitation.viewerState === "wrong_github_account" ? (
        <>
          <p className="text-sm text-muted-foreground">
            Sign out, then continue with @{invitation.targetLogin} on GitHub.
          </p>
          <Button disabled={pendingAction !== null} onClick={runSignOut} variant="outline">
            {pendingAction === "sign-out" ? (
              <>
                <Loader2 className="animate-spin" />
                Signing out...
              </>
            ) : (
              "Sign out"
            )}
          </Button>
        </>
      ) : invitation.viewerState === "already_member" ? (
        <>
          <p className="text-sm text-muted-foreground">
            You already have access. Accept this invitation to close the link.
          </p>
          <Button disabled={pendingAction !== null} onClick={runJoin}>
            {pendingAction === "join" ? (
              <>
                <Loader2 className="animate-spin" />
                Accepting...
              </>
            ) : (
              "Accept invitation"
            )}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Joining gives your current Samebase sessions and MCP clients access to this
            organization.
          </p>
          <Button disabled={pendingAction !== null} onClick={runJoin}>
            {pendingAction === "join" ? (
              <>
                <Loader2 className="animate-spin" />
                Joining...
              </>
            ) : (
              "Join organization"
            )}
          </Button>
        </>
      )}
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </InvitationPageFrame>
  );
}
