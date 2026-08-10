// @vitest-environment jsdom

import type { Id } from "../../convex/_generated/dataModel";
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
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
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
      isDeleting: false,
      isOnlyActiveOwner: false,
      isPersonalGithubOwnerIdentity: true,
      isViewer: true,
      label: "Nicu",
      membershipId: fakeId("membership_nicu"),
      role: "owner",
      userId: fakeId("user_nicu"),
    },
    {
      githubLogin: "noter-guest",
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

describe("OrganizationMembersPageView", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  const actions = {
    cancelInvitation: vi.fn(async () => null),
    changeRole: vi.fn(async () => null),
    createInvitation: vi.fn(async () => createdInvitation),
    leaveOrganization: vi.fn(async () => null),
    removeMember: vi.fn(async () => null),
    resolveInvitationTarget: vi.fn(async () => resolvedTarget),
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
          page={page}
        />,
      );
    });
  }

  it("shows separate Samebase and GitHub status with owner actions", async () => {
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);

    expect(rootElement?.textContent).toContain(
      "Samebase access and GitHub organization membership are separate.",
    );
    expect(rootElement?.textContent).toContain("Samebase owner");
    expect(rootElement?.textContent).toContain("GitHub organization owner");
    expect(rootElement?.textContent).toContain("Samebase member");
    expect(rootElement?.textContent).toContain("GitHub organization member");
    expect(rootElement?.textContent).toContain("Pending invitations");
    expect(rootElement?.textContent).not.toContain("invitation-secret");
    expect(getButton(mountedRootElement, "Make Samebase owner").disabled).toBe(false);
  });

  it("names the GitHub owner account on a personal-owner page", async () => {
    await renderPage({
      ...ownerPage,
      organization: {
        ...ownerPage.organization,
        githubOwnerType: "user",
      },
    });

    expect(rootElement?.textContent).toContain(
      "Samebase access and the GitHub owner account are separate.",
    );
    expect(rootElement?.textContent).not.toContain("GitHub organization membership");
  });

  it("resolves one exact GitHub user before it creates a blocked invitation link", async () => {
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);
    await act(async () => getButton(mountedRootElement, "Invite member").click());

    const input = rootElement?.querySelector<HTMLInputElement>("#organization-member-github-login");
    if (!input) {
      throw new Error("GitHub username input was not rendered.");
    }
    const valueDescriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    );
    if (!valueDescriptor || typeof valueDescriptor.set !== "function") {
      throw new Error("HTMLInputElement value setter is unavailable.");
    }
    valueDescriptor.set.call(input, "@octocat");
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
  });

  it("requires a fresh identity resolution after invitation creation fails", async () => {
    actions.createInvitation.mockRejectedValueOnce(
      new Error("The GitHub account changed. Resolve the invitation target again."),
    );
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);
    await act(async () => getButton(mountedRootElement, "Invite member").click());
    const input = rootElement?.querySelector<HTMLInputElement>("#organization-member-github-login");
    if (!input) {
      throw new Error("GitHub username input was not rendered.");
    }
    const valueDescriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    );
    if (!valueDescriptor || typeof valueDescriptor.set !== "function") {
      throw new Error("HTMLInputElement value setter is unavailable.");
    }
    valueDescriptor.set.call(input, "octocat");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => getButton(mountedRootElement, "Find GitHub user").click());
    await act(async () => getButton(mountedRootElement, "Create invitation").click());

    expect(rootElement?.textContent).toContain(
      "The GitHub account changed. Resolve the invitation target again.",
    );
    expect(getButton(mountedRootElement, "Find GitHub user").disabled).toBe(false);
  });

  it("shows unavailable GitHub status and copies a recovered pending link", async () => {
    await renderPage(ownerPage, null);
    const mountedRootElement = getMountedRootElement(rootElement);

    expect(rootElement?.textContent).toContain("GitHub status unavailable");
    await act(async () => getButton(mountedRootElement, "Copy link").click());

    expect(clipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/invite/invitation-secret`,
    );
    expect(rootElement?.textContent).toContain("Copied");
  });

  it("warns before demoting the personal GitHub owner identity", async () => {
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);
    await act(async () => getButton(mountedRootElement, "Make Samebase member").click());

    expect(rootElement?.textContent).toContain(
      "Another Samebase owner cannot reconnect the GitHub App for this personal GitHub owner.",
    );
    await act(async () => getButton(mountedRootElement, "Make Samebase member", 1).click());
    expect(actions.changeRole).toHaveBeenCalledWith(fakeId("membership_nicu"), "member");
  });

  it("routes destructive confirmations and keeps a failed mutation open", async () => {
    let rejectRemove: ((error: Error) => void) | undefined;
    actions.removeMember.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRemove = reject;
        }),
    );
    await renderPage();
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Remove member").click());
    await act(async () => getButton(mountedRootElement, "Remove member", 1).click());
    expect(actions.removeMember).toHaveBeenCalledWith(fakeId("membership_guest"));
    expect(getButton(mountedRootElement, "Removing...").disabled).toBe(true);
    expect(getButton(mountedRootElement, "Cancel").disabled).toBe(true);
    const rejectRemoveMutation = rejectRemove;
    if (!rejectRemoveMutation) {
      throw new Error("Remove member did not start its mutation.");
    }
    await act(async () =>
      rejectRemoveMutation(new Error("Membership changed. Refresh and try again.")),
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

  it("lets a Samebase member leave but does not show owner controls", async () => {
    await renderPage({
      ...ownerPage,
      members: ownerPage.members.map((member) => ({
        ...member,
        isOnlyActiveOwner: false,
        isPersonalGithubOwnerIdentity: false,
        isViewer: member.githubLogin === "noter-guest",
      })),
      pendingInvitations: undefined,
      viewerRole: "member",
    });
    const mountedRootElement = getMountedRootElement(rootElement);

    expect(rootElement?.textContent).not.toContain("Invite member");
    expect(rootElement?.textContent).not.toContain("Pending invitations");
    expect(rootElement?.textContent).not.toContain("GitHub organization owner");
    expect(rootElement?.textContent).not.toContain("Make Samebase owner");
    expect(getButton(mountedRootElement, "Leave organization").disabled).toBe(false);
  });

  it("warns a personal GitHub owner identity before self-leave as a member", async () => {
    await renderPage({
      ...ownerPage,
      members: ownerPage.members.map((member) => ({
        ...member,
        isOnlyActiveOwner: false,
        isPersonalGithubOwnerIdentity: member.githubLogin === "noter-guest",
        isViewer: member.githubLogin === "noter-guest",
      })),
      organization: { ...ownerPage.organization, githubOwnerType: "user" },
      pendingInvitations: undefined,
      viewerRole: "member",
    });
    const mountedRootElement = getMountedRootElement(rootElement);

    await act(async () => getButton(mountedRootElement, "Leave organization").click());

    expect(rootElement?.textContent).toContain(
      "Another Samebase owner cannot reconnect the GitHub App for this personal GitHub owner.",
    );
    expect(rootElement?.textContent).toContain(
      "@noter-guest must rejoin as a Samebase owner to reconnect it.",
    );
  });
});
