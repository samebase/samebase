// @vitest-environment jsdom

import type { Id } from "../../convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  OrganizationMembersPageView,
  type CreatedOrganizationInvitation,
  type InvitationTarget,
  type OrganizationMembersPageData,
} from "./OrganizationMembersPageView";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        <button onClick={() => onOpenChange?.(false)} type="button">
          Request close
        </button>
      </div>
    ) : null,
  DialogContent: ({
    children,
    showCloseButton: _showCloseButton,
    ...props
  }: {
    children: ReactNode;
    showCloseButton?: boolean;
  }) => <div {...props}>{children}</div>,
  DialogDescription: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogFooter: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogTitle: ({ children, ...props }: { children: ReactNode }) => <h2 {...props}>{children}</h2>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button disabled={disabled} onClick={onSelect} type="button">
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const clipboardWriteText = vi.hoisted(() => vi.fn());

function fakeId<TableName extends "organizationMemberships" | "organizations" | "users">(
  value: string,
): Id<TableName> {
  // @ts-expect-error Convex ids are strings at runtime; the view test only needs stable identities.
  return value;
}

function fakeInvitationId(value: string): Id<"organizationInvitations"> {
  // @ts-expect-error Convex ids are strings at runtime; the view test only needs stable identities.
  return value;
}

const ownerPage = {
  members: [
    {
      githubLogin: "nicu",
      isBillingPayer: true,
      isBillingTransferPending: false,
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
      isBillingTransferPending: false,
      isDeleting: false,
      isOnlyActiveOwner: false,
      isPersonalGithubOwnerIdentity: false,
      isViewer: false,
      label: "Noter Guest",
      membershipId: fakeId("membership_guest"),
      role: "member",
      userId: fakeId("user_guest"),
    },
  ],
  organization: {
    githubOwnerLogin: "samebase",
    githubOwnerType: "organization",
    organizationId: fakeId("organization_samebase"),
  },
  pendingInvitations: [
    {
      code: "invitation-secret",
      createdBy: { kind: "displayName", label: "Nicu" },
      createdAt: Date.UTC(2026, 7, 10),
      expiresAt: Date.UTC(2026, 7, 17),
      githubLogin: "octocat",
      invitationId: fakeInvitationId("invitation_octocat"),
    },
  ],
  viewerRole: "owner",
} satisfies OrganizationMembersPageData;

const resolvedTarget = {
  expectedGithubAccountId: "github-account-123",
  githubLogin: "octocat",
  relationship: "organization_member",
} satisfies InvitationTarget;

const createdInvitation = {
  code: "created-invitation-code",
  expiresAt: Date.UTC(2026, 7, 17),
  githubLogin: "octocat",
  invitationId: fakeInvitationId("invitation_created"),
  state: "created",
} satisfies CreatedOrganizationInvitation;

function getButton(rootElement: HTMLElement, label: string, occurrence = 0): HTMLButtonElement {
  const buttons = [...rootElement.querySelectorAll("button")].filter(
    (button) => button.textContent.trim() === label,
  );
  const button = buttons.at(occurrence);
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

function getMountedRootElement(rootElement: HTMLDivElement | null): HTMLDivElement {
  if (rootElement === null) {
    throw new Error("The component root is not mounted.");
  }
  return rootElement;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  if (!valueDescriptor || typeof valueDescriptor.set !== "function") {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  valueDescriptor.set.call(input, value);
}

describe("OrganizationMembersPageView", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  const actions = {
    cancelInvitation: vi.fn(async () => null),
    changeRole: vi.fn(async () => null),
    createInvitation: vi.fn(async (): Promise<CreatedOrganizationInvitation> => createdInvitation),
    leaveOrganization: vi.fn(async () => null),
    removeMember: vi.fn(async () => null),
    resolveInvitationTarget: vi.fn(async (): Promise<InvitationTarget> => resolvedTarget),
    transferBillingPayer: vi.fn(async () => null),
  };

  beforeEach(() => {
    for (const action of Object.values(actions)) {
      action.mockClear();
    }
    clipboardWriteText.mockReset();
    clipboardWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => mountedRoot.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  async function renderPage(
    page: OrganizationMembersPageData = ownerPage,
    githubRelationships: Parameters<
      typeof OrganizationMembersPageView
    >[0]["githubRelationships"] = [
      { status: "organization_owner", userId: fakeId("user_nicu") },
      { status: "organization_member", userId: fakeId("user_guest") },
    ],
  ) {
    await act(async () => {
      root?.render(
        <OrganizationMembersPageView
          githubRelationships={githubRelationships}
          onCancelInvitation={actions.cancelInvitation}
          onChangeRole={actions.changeRole}
          onCreateInvitation={actions.createInvitation}
          onLeaveOrganization={actions.leaveOrganization}
          onRemoveMember={actions.removeMember}
          onResolveInvitationTarget={actions.resolveInvitationTarget}
          onTransferBillingPayer={actions.transferBillingPayer}
          page={page}
        />,
      );
    });
  }

  it("shows Samebase roles and GitHub organization status in separate columns", async () => {
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);
    const memberRows = [
      ...mountedRootElement.querySelectorAll("[data-testid=organization-member-row]"),
    ];
    const memberHeaders = [...mountedRootElement.querySelectorAll("section:first-of-type th")].map(
      (header) => header.textContent.trim(),
    );
    const ownerCells = [...(memberRows.at(0)?.querySelectorAll("td") ?? [])].map((cell) =>
      cell.textContent.trim(),
    );
    const guestCells = [...(memberRows.at(1)?.querySelectorAll("td") ?? [])].map((cell) =>
      cell.textContent.trim(),
    );
    const ownerRoleLabels = [
      ...(memberRows.at(0)?.querySelectorAll("td:nth-child(2) span") ?? []),
    ].map((label) => label.textContent.trim());
    const guestRoleLabels = [
      ...(memberRows.at(1)?.querySelectorAll("td:nth-child(2) span") ?? []),
    ].map((label) => label.textContent.trim());

    expect(memberHeaders).toEqual(["Member", "Samebase role", "GitHub org", "Actions"]);
    expect(ownerCells.slice(1, 3)).toEqual(["OwnerBilling payer", "Owner"]);
    expect(guestCells.slice(1, 3)).toEqual(["Member", "Member"]);
    expect(ownerRoleLabels).toEqual(["Owner", "Billing payer"]);
    expect(guestRoleLabels).toEqual(["Member"]);
    expect(rootElement?.textContent).not.toContain("Only Samebase owner");
    expect(rootElement?.textContent).not.toContain("Add another Samebase owner");
    expect(rootElement?.textContent).toContain("Pending invitations");
    expect(rootElement?.textContent).toContain("Created by");
    expect(rootElement?.textContent).toContain("Nicu");
    expect(rootElement?.textContent).not.toContain("invitation-secret");
    expect(getButton(mountedRootElement, "Make Samebase owner").disabled).toBe(false);

    await renderPage(ownerPage, [
      { status: "not_in_organization", userId: fakeId("user_nicu") },
      { status: "github_account_not_connected", userId: fakeId("user_guest") },
    ]);
    const explicitStatusRows = [
      ...mountedRootElement.querySelectorAll("[data-testid=organization-member-row]"),
    ];
    expect(explicitStatusRows.at(0)?.querySelector("td:nth-child(3)")?.textContent).toBe(
      "Not in GitHub organization",
    );
    expect(explicitStatusRows.at(1)?.querySelector("td:nth-child(3)")?.textContent).toBe(
      "GitHub not connected",
    );
  });

  it("shows a deleting member and prevents promotion", async () => {
    await renderPage({
      ...ownerPage,
      members: ownerPage.members.map((member) => ({
        ...member,
        isDeleting: member.githubLogin === "noter-guest",
      })),
    });

    const memberRows = [
      ...(rootElement?.querySelectorAll<HTMLElement>("[data-testid=organization-member-row]") ??
        []),
    ];
    const deletingMemberRow = memberRows.at(1);
    if (!deletingMemberRow) {
      throw new Error("The deleting member row was not rendered.");
    }
    expect(deletingMemberRow.textContent).toContain("Deleting");
    expect(getButton(deletingMemberRow, "Make Samebase owner").disabled).toBe(true);
  });

  it("shows the retained presentation for a deleted invitation creator", async () => {
    await renderPage({
      ...ownerPage,
      pendingInvitations: ownerPage.pendingInvitations.map((invitation) => ({
        ...invitation,
        createdBy: { kind: "deleted", label: "Deleted Samebase account" },
      })),
    });

    const createdByCell = rootElement?.querySelector(
      "[data-testid=organization-invitation-row] td:nth-child(2)",
    );
    expect(createdByCell?.textContent).toBe("Deleted Samebase account");
  });

  it("uses a GitHub owner column for a personal-owner page", async () => {
    await renderPage(
      {
        ...ownerPage,
        members: ownerPage.members.map((member) => ({
          ...member,
          isPersonalGithubOwnerIdentity: member.githubLogin === "nicu",
        })),
        organization: {
          ...ownerPage.organization,
          githubOwnerLogin: "nicu",
          githubOwnerType: "user",
        },
      },
      [
        { status: "owner_account", userId: fakeId("user_nicu") },
        { status: "different_account", userId: fakeId("user_guest") },
      ],
    );

    const mountedRootElement = getMountedRootElement(rootElement);
    const memberHeaders = [...mountedRootElement.querySelectorAll("section:first-of-type th")].map(
      (header) => header.textContent.trim(),
    );
    expect(memberHeaders).toEqual(["Member", "Samebase role", "GitHub owner", "Actions"]);
    expect(rootElement?.textContent).toContain("Owner account");
    expect(rootElement?.textContent).toContain("Different account");
  });

  it("resolves one exact GitHub user and keeps a created link usable after copy fails", async () => {
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);
    await act(async () => getButton(mountedRootElement, "Invite member").click());

    const input = rootElement?.querySelector<HTMLInputElement>("#organization-member-github-login");
    if (!input) {
      throw new Error("GitHub username input was not rendered.");
    }
    setInputValue(input, "@octocat");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));

    expect(actions.resolveInvitationTarget).not.toHaveBeenCalled();
    await act(async () => getButton(mountedRootElement, "Find GitHub user").click());
    expect(actions.resolveInvitationTarget).toHaveBeenCalledWith("octocat");
    expect(rootElement?.textContent).toContain("@octocat");

    await act(async () => getButton(mountedRootElement, "Create invitation").click());
    expect(actions.createInvitation).toHaveBeenCalledWith({
      expectedGithubAccountId: "github-account-123",
      githubLogin: "octocat",
    });
    const invitationLinkInput = rootElement?.querySelector("[data-posthog-block] input[readonly]");
    if (!(invitationLinkInput instanceof HTMLInputElement)) {
      throw new Error("Invitation link input was not rendered.");
    }
    expect(invitationLinkInput.value).toBe(
      `${window.location.origin}/invite/created-invitation-code`,
    );

    clipboardWriteText.mockImplementationOnce(() => {
      throw new Error("Clipboard access was denied.");
    });
    await act(async () => getButton(mountedRootElement, "Copy link").click());

    expect(rootElement?.textContent).toContain(
      "Could not copy the invitation link. Copy it from the field.",
    );
    expect(getButton(mountedRootElement, "Copy link").disabled).toBe(false);
    expect(getButton(mountedRootElement, "Done").disabled).toBe(false);
  });

  it("requires a fresh identity resolution after invitation creation fails", async () => {
    actions.createInvitation.mockRejectedValueOnce(
      new ConvexError("The GitHub account changed. Resolve the invitation target again."),
    );
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);
    await act(async () => getButton(mountedRootElement, "Invite member").click());
    const input = rootElement?.querySelector<HTMLInputElement>("#organization-member-github-login");
    if (!input) {
      throw new Error("GitHub username input was not rendered.");
    }
    setInputValue(input, "octocat");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => getButton(mountedRootElement, "Find GitHub user").click());
    await act(async () => getButton(mountedRootElement, "Create invitation").click());

    expect(rootElement?.textContent).toContain(
      "The GitHub account changed. Resolve the invitation target again.",
    );
    expect(getButton(mountedRootElement, "Find GitHub user").disabled).toBe(false);
  });

  it("does not close the invitation dialog while a lookup is pending", async () => {
    let finishLookup: ((target: InvitationTarget) => void) | undefined;
    actions.resolveInvitationTarget.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLookup = resolve;
        }),
    );
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);
    await act(async () => getButton(mountedRootElement, "Invite member").click());
    const input = rootElement?.querySelector<HTMLInputElement>("#organization-member-github-login");
    if (!input) {
      throw new Error("GitHub username input was not rendered.");
    }
    setInputValue(input, "octocat");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => getButton(mountedRootElement, "Find GitHub user").click());

    expect(getButton(mountedRootElement, "Finding...").disabled).toBe(true);
    expect(getButton(mountedRootElement, "Cancel").disabled).toBe(true);
    await act(async () => getButton(mountedRootElement, "Request close").click());
    expect(rootElement?.textContent).toContain("Finding...");

    const completeLookup = finishLookup;
    if (!completeLookup) {
      throw new Error("GitHub lookup did not start.");
    }
    await act(async () => completeLookup(resolvedTarget));
  });

  it("shows unavailable GitHub status and copies a recovered pending link", async () => {
    await renderPage(ownerPage, null);
    const mountedRootElement = getMountedRootElement(rootElement);

    expect(rootElement?.textContent).toContain("Unavailable");
    await act(async () => getButton(mountedRootElement, "Copy link").click());

    expect(clipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/invite/invitation-secret`,
    );
    expect(rootElement?.textContent).toContain("Copied");
    expect(rootElement?.querySelector("input[readonly]")).toBeNull();
  });

  it("copies only one recovered pending invitation at a time", async () => {
    let finishCopy: (() => void) | undefined;
    clipboardWriteText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
        }),
    );
    await renderPage({
      ...ownerPage,
      pendingInvitations: [
        ...ownerPage.pendingInvitations,
        {
          ...ownerPage.pendingInvitations[0],
          code: "second-invitation-secret",
          githubLogin: "hubot",
          invitationId: fakeInvitationId("invitation_hubot"),
        },
      ],
    });
    const invitationRows = [
      ...(rootElement?.querySelectorAll<HTMLElement>("[data-testid=organization-invitation-row]") ??
        []),
    ];
    const firstRow = invitationRows.at(0);
    const secondRow = invitationRows.at(1);
    if (!firstRow || !secondRow) {
      throw new Error("Both pending invitation rows were not rendered.");
    }

    await act(async () => getButton(firstRow, "Copy link").click());

    expect(getButton(firstRow, "Copying...").disabled).toBe(true);
    const secondCopyButton = getButton(secondRow, "Copy link");
    expect(secondCopyButton.disabled).toBe(true);
    secondCopyButton.click();
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);

    const completeCopy = finishCopy;
    if (!completeCopy) {
      throw new Error("The pending invitation copy did not start.");
    }
    await act(async () => completeCopy());

    expect(getButton(firstRow, "Copied").disabled).toBe(false);
    expect(getButton(secondRow, "Copy link").disabled).toBe(false);
  });

  it("shows a selectable invitation link when clipboard access fails", async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error("Clipboard access was denied."));
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Copy link").click());

    const fallbackInput = rootElement?.querySelector<HTMLInputElement>(
      "[data-posthog-block] input[readonly]",
    );
    if (!fallbackInput) {
      throw new Error("Invitation link fallback was not rendered.");
    }
    const invitationUrl = `${window.location.origin}/invite/invitation-secret`;
    expect(fallbackInput.value).toBe(invitationUrl);
    expect(rootElement?.textContent).toContain(
      "Could not copy the invitation link. Copy it from the field.",
    );

    fallbackInput.focus();
    expect(fallbackInput.selectionStart).toBe(0);
    expect(fallbackInput.selectionEnd).toBe(invitationUrl.length);
  });

  it("hides a failed-copy link when that invitation is no longer pending", async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error("Clipboard access was denied."));
    const remainingInvitation = {
      ...ownerPage.pendingInvitations[0],
      code: "second-invitation-secret",
      githubLogin: "hubot",
      invitationId: fakeInvitationId("invitation_hubot"),
    };
    await renderPage({
      ...ownerPage,
      pendingInvitations: [...ownerPage.pendingInvitations, remainingInvitation],
    });
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Copy link").click());
    expect(rootElement?.querySelector("[data-posthog-block] input[readonly]")).not.toBeNull();

    await renderPage({ ...ownerPage, pendingInvitations: [remainingInvitation] });

    expect(rootElement?.querySelector("[data-posthog-block] input[readonly]")).toBeNull();
    expect(rootElement?.textContent).toContain("@hubot");
    expect(rootElement?.textContent).toContain("Pending invitations");
  });

  it("warns before demoting the personal GitHub owner identity", async () => {
    await renderPage(
      {
        ...ownerPage,
        members: ownerPage.members.map((member) => ({
          ...member,
          isBillingPayer: member.githubLogin === "noter-guest",
          isOnlyActiveOwner: false,
          isPersonalGithubOwnerIdentity: member.githubLogin === "nicu",
          role: "owner",
        })),
        organization: {
          ...ownerPage.organization,
          githubOwnerLogin: "nicu",
          githubOwnerType: "user",
        },
      },
      [
        { status: "owner_account", userId: fakeId("user_nicu") },
        { status: "different_account", userId: fakeId("user_guest") },
      ],
    );
    const mountedRootElement = getMountedRootElement(rootElement);
    await act(async () => getButton(mountedRootElement, "Make Samebase member").click());

    expect(rootElement?.textContent).toContain(
      "Another Samebase owner cannot reconnect the GitHub App for this personal GitHub owner.",
    );
    expect(rootElement?.textContent).toContain(
      "You will keep organization access but lose owner controls.",
    );
    const confirmationDialog = rootElement?.querySelector<HTMLElement>("[role=dialog]");
    if (!confirmationDialog) {
      throw new Error("Role confirmation dialog was not rendered.");
    }
    await act(async () => getButton(confirmationDialog, "Make Samebase member").click());
    expect(actions.changeRole).toHaveBeenCalledWith(fakeId("membership_nicu"), "member");
  });

  it("confirms billing payer transfer and keeps a failed transfer recoverable", async () => {
    let rejectTransfer: ((error: Error) => void) | undefined;
    actions.transferBillingPayer.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectTransfer = reject;
        }),
    );
    const sharedOwnerPage = {
      ...ownerPage,
      members: ownerPage.members.map((member) => ({
        ...member,
        isOnlyActiveOwner: false,
        role: "owner" as const,
      })),
    } satisfies OrganizationMembersPageData;
    await renderPage(sharedOwnerPage);
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Transfer billing payer").click());
    expect(rootElement?.textContent).toContain("Transfer billing to @noter-guest?");
    expect(rootElement?.textContent).toContain(
      "They will become the only owner who can change this subscription and open its Polar billing portal.",
    );
    await act(async () => getButton(mountedRootElement, "Transfer billing payer", 1).click());

    expect(actions.transferBillingPayer).toHaveBeenCalledWith(fakeId("membership_guest"));
    expect(getButton(mountedRootElement, "Transferring...").disabled).toBe(true);
    expect(getButton(mountedRootElement, "Cancel").disabled).toBe(true);
    await act(async () => getButton(mountedRootElement, "Request close").click());
    expect(rootElement?.textContent).toContain("Transferring...");

    const failTransfer = rejectTransfer;
    if (!failTransfer) {
      throw new Error("Billing payer transfer did not start.");
    }
    await act(async () =>
      failTransfer(
        new ConvexError("Polar could not finish the billing payer transfer. Try again."),
      ),
    );
    expect(rootElement?.textContent).toContain(
      "Polar could not finish the billing payer transfer. Try again.",
    );

    await renderPage({
      ...sharedOwnerPage,
      members: sharedOwnerPage.members.map((member) => ({
        ...member,
        isBillingTransferPending: member.githubLogin === "noter-guest",
      })),
    });
    expect(rootElement?.textContent).toContain("Billing transfer pending");
    await act(async () => getButton(mountedRootElement, "Cancel").click());
    const targetRow = rootElement?.querySelectorAll<HTMLElement>(
      "[data-testid=organization-member-row]",
    )[1];
    if (!targetRow) {
      throw new Error("Billing payer transfer target row is missing.");
    }
    expect(getButton(targetRow, "Make Samebase member").disabled).toBe(true);
    expect(getButton(targetRow, "Remove member").disabled).toBe(true);
    expect(getButton(targetRow, "Continue billing transfer").disabled).toBe(false);
  });

  it("routes destructive confirmations and keeps a failed mutation open", async () => {
    let rejectRemove: ((error: Error) => void) | undefined;
    actions.removeMember.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRemove = reject;
        }),
    );
    await renderPage({
      ...ownerPage,
      members: ownerPage.members.map((member) => ({
        ...member,
        isBillingPayer: false,
        isOnlyActiveOwner: false,
        role: "owner",
      })),
    });
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Remove member").click());
    await act(async () => getButton(mountedRootElement, "Remove member", 1).click());
    expect(actions.removeMember).toHaveBeenCalledWith(fakeId("membership_guest"));
    expect(getButton(mountedRootElement, "Removing...").disabled).toBe(true);
    expect(getButton(mountedRootElement, "Cancel").disabled).toBe(true);
    await act(async () => getButton(mountedRootElement, "Request close").click());
    expect(rootElement?.textContent).toContain("Removing...");
    const rejectRemoveMutation = rejectRemove;
    if (!rejectRemoveMutation) {
      throw new Error("Remove member did not start its mutation.");
    }
    await act(async () =>
      rejectRemoveMutation(new ConvexError("Membership changed. Refresh and try again.")),
    );
    expect(rootElement?.textContent).toContain("Membership changed. Refresh and try again.");
    expect(getButton(mountedRootElement, "Remove member", 1).disabled).toBe(false);
    await act(async () => getButton(mountedRootElement, "Cancel").click());

    await act(async () => getButton(mountedRootElement, "Leave organization").click());
    await act(async () => getButton(mountedRootElement, "Leave organization", 1).click());
    expect(actions.leaveOrganization).toHaveBeenCalledTimes(1);

    await act(async () => getButton(mountedRootElement, "Cancel invitation").click());
    await act(async () => getButton(mountedRootElement, "Cancel invitation", 1).click());
    expect(actions.cancelInvitation).toHaveBeenCalledWith(fakeInvitationId("invitation_octocat"));
  });

  it("does not expose an internal member mutation failure", async () => {
    actions.removeMember.mockRejectedValueOnce(new Error("Membership reference is corrupt."));
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Remove member").click());
    await act(async () => getButton(mountedRootElement, "Remove member", 1).click());

    expect(rootElement?.textContent).toContain("Could not complete this action. Try again.");
    expect(rootElement?.textContent).not.toContain("Membership reference is corrupt.");
  });

  it("lets a Samebase member leave but does not show owner controls", async () => {
    await renderPage(
      {
        ...ownerPage,
        members: ownerPage.members.map((member) => ({
          ...member,
          isOnlyActiveOwner: false,
          isPersonalGithubOwnerIdentity: false,
          isViewer: member.githubLogin === "noter-guest",
        })),
        pendingInvitations: undefined,
        viewerRole: "member",
      },
      [],
    );
    const mountedRootElement = getMountedRootElement(rootElement);

    expect(rootElement?.textContent).not.toContain("Invite member");
    expect(rootElement?.textContent).not.toContain("Pending invitations");
    expect(rootElement?.textContent).not.toContain("GitHub org");
    expect(rootElement?.textContent).not.toContain("Make Samebase owner");
    expect(getButton(mountedRootElement, "Leave organization").disabled).toBe(false);
  });

  it("warns a personal GitHub owner identity before self-leave as a member", async () => {
    await renderPage(
      {
        ...ownerPage,
        members: ownerPage.members.map((member) => ({
          ...member,
          isOnlyActiveOwner: false,
          isPersonalGithubOwnerIdentity: member.githubLogin === "nicu",
          isViewer: member.githubLogin === "nicu",
          role: member.githubLogin === "nicu" ? "member" : "owner",
        })),
        organization: {
          ...ownerPage.organization,
          githubOwnerLogin: "nicu",
          githubOwnerType: "user",
        },
        pendingInvitations: undefined,
        viewerRole: "member",
      },
      [],
    );
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Leave organization").click());

    expect(rootElement?.textContent).toContain(
      "Another Samebase owner cannot reconnect the GitHub App for this personal GitHub owner.",
    );
    expect(rootElement?.textContent).toContain(
      "@nicu must rejoin as a Samebase owner to reconnect it.",
    );
  });
});
