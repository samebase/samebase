// @vitest-environment jsdom

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { ConvexError } from "convex/values";
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

  async function mountInvitation(onJoin: () => Promise<unknown>): Promise<HTMLDivElement> {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(
        <TestRouterProvider initialEntries={["/invite/invitation-code"]}>
          <OrganizationInvitationPageView
            invitation={availableInvitation}
            onJoin={onJoin}
            onSignOut={async () => undefined}
          />
        </TestRouterProvider>,
      );
    });

    return rootElement;
  }

  async function clickJoin(rootElement: HTMLDivElement): Promise<void> {
    const joinButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Join organization",
    );
    if (!joinButton) {
      throw new Error("Join organization button was not rendered.");
    }
    await act(async () => joinButton.click());
  }

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
    const mountedRootElement = await mountInvitation(join);

    expect(mountedRootElement.textContent).toContain(
      "Joining gives your current Samebase sessions and MCP clients access to this organization.",
    );
    await clickJoin(mountedRootElement);

    expect(join).toHaveBeenCalledTimes(1);
    expect(mountedRootElement.textContent).toContain("Joining...");
  });

  it("shows a transported invitation failure", async () => {
    const mountedRootElement = await mountInvitation(async () => {
      throw new ConvexError("Invitation has expired.");
    });

    await clickJoin(mountedRootElement);

    expect(mountedRootElement.textContent).toContain("Invitation has expired.");
    expect(mountedRootElement.textContent).not.toContain("Could not join. Try again.");
  });

  it("does not expose an internal invitation failure", async () => {
    const mountedRootElement = await mountInvitation(async () => {
      throw new Error("Invitation storage invariant failed.");
    });

    await clickJoin(mountedRootElement);

    expect(mountedRootElement.textContent).toContain("Could not join. Try again.");
    expect(mountedRootElement.textContent).not.toContain("Invitation storage invariant failed.");
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
      isViewerMember: true,
      organizationOwnerLogin: "samebase",
      state: "accepted",
      targetLogin: "noter-guest",
    });

    expect(markup).toContain("Invitation accepted");
    expect(markup).toContain("You are a Samebase member of @samebase.");
    expect(markup).toContain('href="/org/samebase/repositories"');
    expect(markup).toContain("Open organization");
  });

  it("does not add details to an unavailable invitation", () => {
    const unavailableMarkup = renderInvitation({ state: "unavailable" });

    expect(unavailableMarkup).toContain("Invitation unavailable");
    expect(unavailableMarkup).toContain("This invitation is not available.");
    expect(unavailableMarkup).not.toContain("Join organization");
  });

  it("does not claim that a removed recipient still has access", () => {
    const markup = renderInvitation({
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
