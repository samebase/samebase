// @vitest-environment jsdom

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { OrganizationInvitationPageView } from "./OrganizationInvitationPageView";

const availableInvitation = {
  organizationOwnerLogin: "samebase",
  state: "available",
  targetLogin: "noter-guest",
  viewerState: "can_accept",
} as const;

function renderInvitation(
  invitation: Parameters<typeof OrganizationInvitationPageView>[0]["invitation"],
) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/invite/invitation-code"]}>
      <OrganizationInvitationPageView
        invitation={invitation}
        onJoin={async () => undefined}
        onSignOut={async () => undefined}
      />
    </TestRouterProvider>,
  );
}

describe("OrganizationInvitationPageView", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => mountedRoot.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("blocks the invitation surface and gives signed-out GitHub instructions", () => {
    const markup = renderInvitation({
      ...availableInvitation,
      viewerState: "signed_out",
    });

    expect(markup).toContain("data-posthog-block");
    expect(markup).toContain("Join @samebase on Samebase");
    expect(markup).toContain("Sign in with @noter-guest on GitHub from the account sidebar.");
    expect(markup).not.toContain("Joining gives your current Samebase sessions");
    expect(markup).not.toContain("Join organization");
  });

  it("shows the session and MCP access effect before explicit acceptance", async () => {
    const join = vi.fn(() => new Promise<never>(() => {}));
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(
        <TestRouterProvider initialEntries={["/invite/invitation-code"]}>
          <OrganizationInvitationPageView
            invitation={availableInvitation}
            onJoin={join}
            onSignOut={async () => undefined}
          />
        </TestRouterProvider>,
      );
    });

    expect(rootElement.textContent).toContain(
      "Joining gives your current Samebase sessions and MCP clients access to this organization.",
    );
    const joinButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Join organization",
    );
    if (!joinButton) {
      throw new Error("Join organization button was not rendered.");
    }
    await act(async () => joinButton.click());

    expect(join).toHaveBeenCalledTimes(1);
    expect(rootElement.textContent).toContain("Joining...");
  });

  it("does not expose acceptance to the wrong GitHub account", () => {
    const markup = renderInvitation({
      ...availableInvitation,
      viewerState: "wrong_github_account",
    });

    expect(markup).toContain("Sign out, then continue with @noter-guest on GitHub.");
    expect(markup).toContain("Sign out");
    expect(markup).not.toContain("Joining gives your current Samebase sessions");
    expect(markup).not.toContain("Join organization");
  });

  it("lets an existing member consume the invitation before it can be reused", () => {
    const markup = renderInvitation({
      ...availableInvitation,
      viewerState: "already_member",
    });

    expect(markup).toContain("You already have access. Accept this invitation to close the link.");
    expect(markup).toContain("Accept invitation");
    expect(markup).not.toContain("Open organization");
  });

  it("links an accepted invitation to the organization", () => {
    const markup = renderInvitation({
      isAcceptedByViewer: true,
      isViewerMember: true,
      organizationOwnerLogin: "samebase",
      state: "accepted",
      targetLogin: "noter-guest",
    });

    expect(markup).toContain("Invitation accepted");
    expect(markup).toContain("You are a Samebase member of @samebase.");
    expect(markup).toContain('href="/org/samebase/vaults"');
    expect(markup).toContain("Open organization");
  });

  it("conceals unavailable invitations and invitations accepted by another user", () => {
    const unavailableMarkup = renderInvitation({ state: "unavailable" });
    const acceptedByOtherMarkup = renderInvitation({
      isAcceptedByViewer: false,
      isViewerMember: false,
      organizationOwnerLogin: "private-owner",
      state: "accepted",
      targetLogin: "private-target",
    });

    expect(unavailableMarkup).toContain("Invitation unavailable");
    expect(unavailableMarkup).toContain("This invitation expired or was canceled.");
    expect(acceptedByOtherMarkup).toContain("Invitation unavailable");
    expect(acceptedByOtherMarkup).toContain("This invitation has already been used.");
    expect(acceptedByOtherMarkup).not.toContain("private-owner");
    expect(acceptedByOtherMarkup).not.toContain("private-target");
  });

  it("does not claim that a removed recipient still has access", () => {
    const markup = renderInvitation({
      isAcceptedByViewer: true,
      isViewerMember: false,
      organizationOwnerLogin: "samebase",
      state: "accepted",
      targetLogin: "noter-guest",
    });

    expect(markup).toContain("Invitation already used");
    expect(markup).toContain("Ask a Samebase owner for a new invitation.");
    expect(markup).not.toContain("You are a Samebase member");
    expect(markup).not.toContain("Open organization");
  });
});
