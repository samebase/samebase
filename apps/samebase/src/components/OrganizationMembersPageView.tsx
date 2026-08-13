import { AppDialogContent } from "@/components/AppDialogContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { ConvexError } from "convex/values";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Fragment, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type OrganizationInvitationId = Id<"organizationInvitations">;

export type OrganizationMembersPageData = GetFunctionReferenceReturnType<
  typeof api.organizationMembers.getPage
>;

export type OrganizationMember = OrganizationMembersPageData["members"][number];

export type OrganizationMemberRole = OrganizationMember["role"];

export type PendingOrganizationInvitation = NonNullable<
  OrganizationMembersPageData["pendingInvitations"]
>[number];

export type MemberGitHubRelationship = GetFunctionReferenceReturnType<
  typeof api.organizationMembers.getGitHubRelationships
>[number];

export type MemberGitHubRelationshipStatus = MemberGitHubRelationship["status"];

export type InvitationTarget = GetFunctionReferenceReturnType<
  typeof api.organizationMembers.resolveInvitationTarget
>;

export type CreatedOrganizationInvitation = GetFunctionReferenceReturnType<
  typeof api.organizationMembers.createInvitation
>;

type MemberConfirmation =
  | { kind: "change-role"; member: OrganizationMember; role: OrganizationMemberRole }
  | { kind: "transfer-billing"; member: OrganizationMember }
  | { kind: "remove"; member: OrganizationMember }
  | { kind: "leave"; member: OrganizationMember }
  | { kind: "cancel-invitation"; invitation: PendingOrganizationInvitation };

type OrganizationMembersPageViewProps = {
  githubRelationships: readonly MemberGitHubRelationship[] | null | undefined;
  onCancelInvitation: (invitationId: OrganizationInvitationId) => Promise<unknown>;
  onChangeRole: (
    membershipId: Id<"organizationMemberships">,
    role: OrganizationMemberRole,
  ) => Promise<unknown>;
  onCreateInvitation: (args: {
    expectedGithubAccountId: string;
    githubLogin: string;
  }) => Promise<CreatedOrganizationInvitation>;
  onLeaveOrganization: () => Promise<unknown>;
  onRemoveMember: (membershipId: Id<"organizationMemberships">) => Promise<unknown>;
  onResolveInvitationTarget: (githubLogin: string) => Promise<InvitationTarget>;
  onTransferBillingPayer: (membershipId: Id<"organizationMemberships">) => Promise<unknown>;
  page: OrganizationMembersPageData;
};

function readProductError(error: unknown, fallback: string): string {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data : fallback;
}

function formatGitHubRelationship(status: MemberGitHubRelationshipStatus): string {
  switch (status) {
    case "organization_owner":
      return "GitHub organization owner";
    case "organization_member":
      return "GitHub organization member";
    case "not_in_organization":
      return "Not in GitHub organization";
    case "github_account_not_connected":
      return "GitHub not connected";
    case "owner_account":
      return "GitHub owner account";
    case "different_account":
      return "Different GitHub account";
    case "unavailable":
      return "GitHub status unavailable";
    default:
      status satisfies never;
      return "GitHub status unavailable";
  }
}

function formatGitHubTableStatus(status: MemberGitHubRelationshipStatus): string {
  switch (status) {
    case "organization_owner":
      return "Owner";
    case "organization_member":
      return "Member";
    case "not_in_organization":
      return "Not in GitHub organization";
    case "github_account_not_connected":
      return "GitHub not connected";
    case "owner_account":
      return "Owner account";
    case "different_account":
      return "Different account";
    case "unavailable":
      return "Unavailable";
    default:
      status satisfies never;
      return "Unavailable";
  }
}

function formatInvitationExpiry(expiresAt: number): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(expiresAt);
}

function getMemberIdentity(member: OrganizationMember): string {
  return member.githubLogin ? `@${member.githubLogin}` : member.label;
}

function MemberAvatar({ avatarUrl, label }: { avatarUrl?: string; label: string }) {
  return avatarUrl ? (
    <img
      alt=""
      className="size-9 shrink-0 rounded-full bg-muted object-cover"
      height={36}
      loading="lazy"
      src={avatarUrl}
      width={36}
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
    >
      {label.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

function MemberActionsMenu({
  billingTransferPending,
  member,
  onConfirm,
  viewerIsBillingPayer,
  viewerRole,
}: {
  billingTransferPending: boolean;
  member: OrganizationMember;
  onConfirm: (confirmation: MemberConfirmation) => void;
  viewerIsBillingPayer: boolean;
  viewerRole: OrganizationMemberRole;
}) {
  const actions: Array<{
    disabled?: boolean;
    key: string;
    label: string;
    onSelect: () => void;
    variant?: "destructive";
  }> = [];

  if (viewerRole === "owner") {
    const membershipChangeProtected = member.isBillingPayer || member.isBillingTransferPending;
    if (member.role === "owner") {
      actions.push({
        disabled: member.isOnlyActiveOwner || membershipChangeProtected,
        key: "make-member",
        label: "Make Samebase member",
        onSelect: () => onConfirm({ kind: "change-role", member, role: "member" }),
      });
    } else {
      actions.push({
        disabled: member.isDeleting,
        key: "make-owner",
        label: "Make Samebase owner",
        onSelect: () => onConfirm({ kind: "change-role", member, role: "owner" }),
      });
    }

    if (
      viewerIsBillingPayer &&
      member.role === "owner" &&
      !member.isViewer &&
      !member.isDeleting &&
      (!billingTransferPending || member.isBillingTransferPending)
    ) {
      actions.push({
        key: "transfer-billing",
        label: member.isBillingTransferPending
          ? "Continue billing transfer"
          : "Transfer billing payer",
        onSelect: () => onConfirm({ kind: "transfer-billing", member }),
      });
    }

    actions.push({
      disabled: member.isOnlyActiveOwner || membershipChangeProtected,
      key: member.isViewer ? "leave" : "remove",
      label: member.isViewer ? "Leave organization" : "Remove member",
      onSelect: () =>
        onConfirm(member.isViewer ? { kind: "leave", member } : { kind: "remove", member }),
      variant: "destructive",
    });
  } else if (member.isViewer) {
    actions.push({
      key: "leave",
      label: "Leave organization",
      onSelect: () => onConfirm({ kind: "leave", member }),
      variant: "destructive",
    });
  }

  if (actions.length === 0 || actions.every((action) => action.disabled)) {
    return null;
  }

  const destructiveActionIndex = actions.findIndex((action) => action.variant === "destructive");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button aria-label={`${member.label} actions`} size="icon-sm" type="button" variant="ghost">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-none shadow-none">
        {actions.map((action, index) => (
          <Fragment key={action.key}>
            {index === destructiveActionIndex && index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={action.disabled}
              onSelect={action.onSelect}
              variant={action.variant}
            >
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InviteMemberDialog({
  onClose,
  onCreateInvitation,
  onResolveInvitationTarget,
}: {
  onClose: () => void;
  onCreateInvitation: OrganizationMembersPageViewProps["onCreateInvitation"];
  onResolveInvitationTarget: OrganizationMembersPageViewProps["onResolveInvitationTarget"];
}) {
  const [githubLogin, setGithubLogin] = useState("");
  const [target, setTarget] = useState<InvitationTarget | null>(null);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedOrganizationInvitation | null>(
    null,
  );
  const [pending, setPending] = useState<"resolve" | "create" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedLogin = githubLogin.trim().replace(/^@/, "");
  const invitationUrl =
    createdInvitation === null
      ? null
      : `${window.location.origin}/invite/${encodeURIComponent(createdInvitation.code)}`;

  const resolveTarget = () => {
    if (!normalizedLogin || pending !== null) {
      return;
    }
    setPending("resolve");
    setError(null);
    void onResolveInvitationTarget(normalizedLogin)
      .then((resolvedTarget) => {
        setGithubLogin(resolvedTarget.githubLogin);
        setTarget(resolvedTarget);
      })
      .catch((resolveError: unknown) => {
        setError(readProductError(resolveError, "Could not find this GitHub user. Try again."));
      })
      .finally(() => setPending(null));
  };

  const createInvitation = () => {
    if (target === null || pending !== null) {
      return;
    }
    setPending("create");
    setError(null);
    void onCreateInvitation({
      expectedGithubAccountId: target.expectedGithubAccountId,
      githubLogin: target.githubLogin,
    })
      .then(setCreatedInvitation)
      .catch((createError: unknown) => {
        setTarget(null);
        setError(readProductError(createError, "Could not create the invitation. Try again."));
      })
      .finally(() => setPending(null));
  };

  const copyInvitationLink = () => {
    if (invitationUrl === null || pending !== null) {
      return;
    }
    setPending("copy");
    setError(null);
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(invitationUrl))
      .then(() => setCopied(true))
      .catch(() => {
        setError("Could not copy the invitation link. Copy it from the field.");
      })
      .finally(() => setPending(null));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && pending === null) {
          onClose();
        }
      }}
    >
      <AppDialogContent data-posthog-block showCloseButton={pending === null}>
        {createdInvitation === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite member</DialogTitle>
              <DialogDescription>
                The invitation works only for this GitHub account. They will join as a Samebase
                member.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (target === null) {
                  resolveTarget();
                } else {
                  createInvitation();
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="organization-member-github-login">GitHub username</Label>
                <Input
                  id="organization-member-github-login"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  disabled={pending !== null}
                  onChange={(event) => {
                    setGithubLogin(event.target.value);
                    setTarget(null);
                    setError(null);
                  }}
                  spellCheck={false}
                  value={githubLogin}
                />
              </div>
              {target === null ? null : (
                <div className="flex items-center gap-3 border-y border-border/50 py-3">
                  <MemberAvatar avatarUrl={target.githubAvatarUrl} label={target.githubLogin} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">@{target.githubLogin}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatGitHubRelationship(target.relationship)}
                    </div>
                  </div>
                </div>
              )}
              {error === null ? null : (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  disabled={pending !== null}
                  onClick={onClose}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                {target === null ? (
                  <Button disabled={!normalizedLogin || pending !== null} type="submit">
                    {pending === "resolve" ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Finding...
                      </>
                    ) : (
                      "Find GitHub user"
                    )}
                  </Button>
                ) : (
                  <Button disabled={pending !== null} type="submit">
                    {pending === "create" ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create invitation"
                    )}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invitation created</DialogTitle>
              <DialogDescription>
                Share this link with @{createdInvitation.githubLogin}. It works only for that GitHub
                account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="organization-member-invitation-link">Invitation link</Label>
              <Input
                id="organization-member-invitation-link"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={invitationUrl ?? ""}
              />
              {error === null ? null : (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button disabled={pending !== null} onClick={onClose} type="button" variant="outline">
                Done
              </Button>
              <Button disabled={pending !== null} onClick={copyInvitationLink} type="button">
                {pending === "copy" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Copying...
                  </>
                ) : copied ? (
                  "Copied"
                ) : (
                  "Copy link"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </AppDialogContent>
    </Dialog>
  );
}

function getConfirmationContent(confirmation: MemberConfirmation): {
  actionLabel: string;
  description: string;
  pendingLabel: string;
  title: string;
  variant: "default" | "destructive";
  warning: string | null;
} {
  if (confirmation.kind === "change-role") {
    const identity = getMemberIdentity(confirmation.member);
    if (confirmation.role === "owner") {
      return {
        actionLabel: "Make Samebase owner",
        description: "Samebase owners can manage members, providers, billing, and the GitHub App.",
        pendingLabel: "Making Samebase owner...",
        title: `Make ${identity} a Samebase owner?`,
        variant: "default",
        warning: null,
      };
    }
    return {
      actionLabel: "Make Samebase member",
      description: confirmation.member.isViewer
        ? "You will keep organization access but lose owner controls."
        : "They will keep organization access but lose owner controls.",
      pendingLabel: "Making Samebase member...",
      title: `Make ${identity} a Samebase member?`,
      variant: "default",
      warning: confirmation.member.isPersonalGithubOwnerIdentity
        ? `Another Samebase owner cannot reconnect the GitHub App for this personal GitHub owner. ${identity} must become a Samebase owner again to reconnect it.`
        : null,
    };
  }

  if (confirmation.kind === "remove") {
    const identity = getMemberIdentity(confirmation.member);
    return {
      actionLabel: "Remove member",
      description: "They will lose Samebase access. Their account and organization data will stay.",
      pendingLabel: "Removing...",
      title: `Remove ${identity}?`,
      variant: "destructive",
      warning: confirmation.member.isPersonalGithubOwnerIdentity
        ? `Another Samebase owner cannot reconnect the GitHub App for this personal GitHub owner. ${identity} must rejoin as a Samebase owner to reconnect it.`
        : null,
    };
  }

  if (confirmation.kind === "transfer-billing") {
    const identity = getMemberIdentity(confirmation.member);
    return {
      actionLabel: "Transfer billing payer",
      description:
        "They will become the only owner who can change this subscription and open its Polar billing portal.",
      pendingLabel: "Transferring...",
      title: `Transfer billing to ${identity}?`,
      variant: "default",
      warning: null,
    };
  }

  if (confirmation.kind === "leave") {
    const identity = getMemberIdentity(confirmation.member);
    return {
      actionLabel: "Leave organization",
      description: "You will lose Samebase access. Your account and organization data will stay.",
      pendingLabel: "Leaving...",
      title: "Leave organization?",
      variant: "destructive",
      warning: confirmation.member.isPersonalGithubOwnerIdentity
        ? `Another Samebase owner cannot reconnect the GitHub App for this personal GitHub owner. ${identity} must rejoin as a Samebase owner to reconnect it.`
        : null,
    };
  }

  return {
    actionLabel: "Cancel invitation",
    description: "The invitation link will stop working.",
    pendingLabel: "Canceling...",
    title: `Cancel invitation for @${confirmation.invitation.githubLogin}?`,
    variant: "destructive",
    warning: null,
  };
}

function MemberConfirmationDialog({
  confirmation,
  onCancelInvitation,
  onChangeRole,
  onClose,
  onLeaveOrganization,
  onRemoveMember,
  onTransferBillingPayer,
}: {
  confirmation: MemberConfirmation;
  onCancelInvitation: OrganizationMembersPageViewProps["onCancelInvitation"];
  onChangeRole: OrganizationMembersPageViewProps["onChangeRole"];
  onClose: () => void;
  onLeaveOrganization: OrganizationMembersPageViewProps["onLeaveOrganization"];
  onRemoveMember: OrganizationMembersPageViewProps["onRemoveMember"];
  onTransferBillingPayer: OrganizationMembersPageViewProps["onTransferBillingPayer"];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const content = getConfirmationContent(confirmation);

  const confirm = () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    let promise: Promise<unknown>;
    switch (confirmation.kind) {
      case "change-role":
        promise = onChangeRole(confirmation.member.membershipId, confirmation.role);
        break;
      case "remove":
        promise = onRemoveMember(confirmation.member.membershipId);
        break;
      case "transfer-billing":
        promise = onTransferBillingPayer(confirmation.member.membershipId);
        break;
      case "leave":
        promise = onLeaveOrganization();
        break;
      case "cancel-invitation":
        promise = onCancelInvitation(confirmation.invitation.invitationId);
        break;
      default:
        confirmation satisfies never;
        return;
    }
    void promise.then(onClose).catch((confirmationError: unknown) => {
      setError(readProductError(confirmationError, "Could not complete this action. Try again."));
      setPending(false);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <AppDialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">{content.description}</span>
            {content.warning === null ? null : (
              <span className="block text-foreground">{content.warning}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        {error === null ? null : (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={pending} onClick={confirm} type="button" variant={content.variant}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" />
                {content.pendingLabel}
              </>
            ) : (
              content.actionLabel
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

export function OrganizationMembersPageView({
  githubRelationships,
  onCancelInvitation,
  onChangeRole,
  onCreateInvitation,
  onLeaveOrganization,
  onRemoveMember,
  onResolveInvitationTarget,
  onTransferBillingPayer,
  page,
}: OrganizationMembersPageViewProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<MemberConfirmation | null>(null);
  const [copyingInvitationId, setCopyingInvitationId] = useState<OrganizationInvitationId | null>(
    null,
  );
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<{
    invitationId: OrganizationInvitationId;
    invitationUrl: string;
  } | null>(null);
  const relationshipByUserId = new Map(
    githubRelationships?.map((relationship) => [relationship.userId, relationship.status]),
  );
  const pendingInvitations = page.pendingInvitations ?? [];
  const billingTransferPending = page.members.some((member) => member.isBillingTransferPending);
  const viewerIsBillingPayer = page.members.some(
    (member) => member.isViewer && member.isBillingPayer,
  );
  const visibleCopyFallback =
    copyFallback !== null &&
    pendingInvitations.some((invitation) => invitation.invitationId === copyFallback.invitationId)
      ? copyFallback
      : null;

  const copyPendingInvitation = (invitation: PendingOrganizationInvitation) => {
    if (copyingInvitationId !== null) {
      return;
    }
    const invitationUrl = `${window.location.origin}/invite/${encodeURIComponent(invitation.code)}`;
    setCopyingInvitationId(invitation.invitationId);
    setCopiedInvitationId(null);
    setCopyFallback(null);
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(invitationUrl))
      .then(() => setCopiedInvitationId(invitation.invitationId))
      .catch(() => setCopyFallback({ invitationId: invitation.invitationId, invitationUrl }))
      .finally(() => setCopyingInvitationId(null));
  };

  return (
    <main
      className="container flex min-h-0 flex-1 flex-col py-6"
      data-testid="organization-members-page"
    >
      <div className="flex max-w-3xl items-center justify-between gap-4">
        <h1 className="text-xl font-semibold @2xl:text-2xl">Members</h1>
        {page.viewerRole === "owner" ? (
          <Button onClick={() => setInviteOpen(true)} type="button">
            Invite member
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="organization-members-heading" className="mt-8 max-w-3xl">
        <h2 className="sr-only" id="organization-members-heading">
          Current members
        </h2>
        <table
          aria-labelledby="organization-members-heading"
          className="w-full table-fixed text-left text-sm"
        >
          <thead className="border-y text-xs text-muted-foreground">
            <tr>
              <th className="w-[44%] py-3 pr-4 font-medium" scope="col">
                Member
              </th>
              <th className="w-[24%] py-3 pr-2 font-medium" scope="col">
                Samebase role
              </th>
              {page.viewerRole === "owner" ? (
                <th className="py-3 pr-1 font-medium" scope="col">
                  {page.organization.githubOwnerType === "organization"
                    ? "GitHub org"
                    : "GitHub owner"}
                </th>
              ) : null}
              <th className="w-10 py-3" scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.members.map((member) => {
              const githubRelationship =
                githubRelationships === null
                  ? "unavailable"
                  : (relationshipByUserId.get(member.userId) ?? null);
              return (
                <tr
                  className="border-b last:border-b-0"
                  data-testid="organization-member-row"
                  key={member.membershipId}
                >
                  <td className="py-4 pr-2 align-middle">
                    <div className="flex min-w-0 items-center gap-3">
                      <MemberAvatar avatarUrl={member.avatarUrl} label={member.label} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {member.label}
                          {member.isViewer ? (
                            <span className="text-muted-foreground"> (you)</span>
                          ) : null}
                        </div>
                        {member.githubLogin ? (
                          <div className="truncate text-muted-foreground">
                            @{member.githubLogin}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-2 align-middle">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        className={
                          member.role === "owner"
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300"
                            : "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-300"
                        }
                        variant="outline"
                      >
                        {member.role === "owner" ? "Owner" : "Member"}
                      </Badge>
                      {member.isBillingPayer ? (
                        <Badge
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
                          variant="outline"
                        >
                          Billing payer
                        </Badge>
                      ) : null}
                      {member.isBillingTransferPending ? (
                        <Badge
                          className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
                          variant="outline"
                        >
                          Billing transfer pending
                        </Badge>
                      ) : null}
                    </div>
                    {member.isDeleting ? <div className="text-destructive">Deleting</div> : null}
                  </td>
                  {page.viewerRole === "owner" ? (
                    <td className="py-4 pr-2 align-middle">
                      {githubRelationship === null
                        ? "Checking..."
                        : formatGitHubTableStatus(githubRelationship)}
                    </td>
                  ) : null}
                  <td className="py-4 text-right align-middle">
                    <MemberActionsMenu
                      billingTransferPending={billingTransferPending}
                      member={member}
                      onConfirm={setConfirmation}
                      viewerIsBillingPayer={viewerIsBillingPayer}
                      viewerRole={page.viewerRole}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {page.viewerRole === "owner" && pendingInvitations.length > 0 ? (
        <section aria-labelledby="pending-invitations-heading" className="mt-8 max-w-3xl">
          <h2 className="text-base font-semibold" id="pending-invitations-heading">
            Pending invitations
          </h2>
          <div className="mt-4">
            <table
              aria-labelledby="pending-invitations-heading"
              className="w-full table-fixed text-left text-sm"
            >
              <thead className="border-y text-xs text-muted-foreground">
                <tr>
                  <th className="w-[40%] py-3 pr-4 font-medium" scope="col">
                    GitHub account
                  </th>
                  <th className="w-[24%] py-3 pr-4 font-medium" scope="col">
                    Created by
                  </th>
                  <th className="hidden w-[20%] py-3 pr-4 font-medium @2xl:table-cell" scope="col">
                    Expires
                  </th>
                  <th className="py-3 font-medium" scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingInvitations.map((invitation) => (
                  <tr
                    className="border-b last:border-b-0"
                    data-testid="organization-invitation-row"
                    key={invitation.invitationId}
                  >
                    <td className="py-4 pr-4 align-middle">
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar
                          avatarUrl={invitation.githubAvatarUrl}
                          label={invitation.githubLogin}
                        />
                        <div className="truncate font-medium">@{invitation.githubLogin}</div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 align-middle">{invitation.createdBy.label}</td>
                    <td className="hidden py-4 pr-4 align-middle @2xl:table-cell">
                      {formatInvitationExpiry(invitation.expiresAt)}
                    </td>
                    <td className="py-4 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          disabled={copyingInvitationId !== null}
                          onClick={() => copyPendingInvitation(invitation)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {copyingInvitationId === invitation.invitationId ? (
                            <>
                              <Loader2 className="animate-spin" />
                              Copying...
                            </>
                          ) : copiedInvitationId === invitation.invitationId ? (
                            "Copied"
                          ) : (
                            "Copy link"
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild nativeButton>
                            <Button
                              aria-label={`@${invitation.githubLogin} invitation actions`}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-44 rounded-none shadow-none"
                          >
                            <DropdownMenuItem
                              onSelect={() =>
                                setConfirmation({ kind: "cancel-invitation", invitation })
                              }
                              variant="destructive"
                            >
                              Cancel invitation
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleCopyFallback === null ? null : (
              <div className="mt-3 space-y-2" data-posthog-block>
                <Label htmlFor={`pending-invitation-link-${visibleCopyFallback.invitationId}`}>
                  Invitation link
                </Label>
                <Input
                  aria-describedby={`pending-invitation-copy-error-${visibleCopyFallback.invitationId}`}
                  id={`pending-invitation-link-${visibleCopyFallback.invitationId}`}
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={visibleCopyFallback.invitationUrl}
                />
                <p
                  className="text-sm text-destructive"
                  id={`pending-invitation-copy-error-${visibleCopyFallback.invitationId}`}
                  role="alert"
                >
                  Could not copy the invitation link. Copy it from the field.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {inviteOpen ? (
        <InviteMemberDialog
          onClose={() => setInviteOpen(false)}
          onCreateInvitation={onCreateInvitation}
          onResolveInvitationTarget={onResolveInvitationTarget}
        />
      ) : null}
      {confirmation === null ? null : (
        <MemberConfirmationDialog
          confirmation={confirmation}
          onCancelInvitation={onCancelInvitation}
          onChangeRole={onChangeRole}
          onClose={() => setConfirmation(null)}
          onLeaveOrganization={onLeaveOrganization}
          onRemoveMember={onRemoveMember}
          onTransferBillingPayer={onTransferBillingPayer}
        />
      )}
    </main>
  );
}
