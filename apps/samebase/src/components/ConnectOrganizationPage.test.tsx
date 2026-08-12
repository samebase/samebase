import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  ConnectOrganizationPageView,
  type ConnectOrganizationOption,
  type ConnectOrganizationPageState,
} from "./ConnectOrganizationPage";

const options = [
  {
    status: "connect",
    installationId: "101",
    githubOwnerType: "organization",
    githubOwnerLogin: "available-org",
  },
  {
    status: "open",
    installationId: "102",
    githubOwnerType: "organization",
    githubOwnerLogin: "member-org",
    organizationOwnerLogin: "Member-Org",
  },
  {
    status: "invite_required",
    installationId: "103",
    githubOwnerType: "organization",
    githubOwnerLogin: "invite-org",
  },
  {
    status: "owner_required",
    installationId: "104",
    githubOwnerType: "organization",
    githubOwnerLogin: "admin-org",
  },
] satisfies ConnectOrganizationOption[];

function renderPage(state: ConnectOrganizationPageState) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/connect-organization"]}>
      <ConnectOrganizationPageView
        error={null}
        isAuthorizing={false}
        isInstalling={false}
        onAuthorize={() => {}}
        onConnect={() => {}}
        onInstall={() => {}}
        onRetry={() => {}}
        pendingInstallationId={null}
        state={state}
      />
    </TestRouterProvider>,
  );
}

describe("ConnectOrganizationPageView", () => {
  it("shows the action and explanation for each installation state", () => {
    const markup = renderPage({ status: "ready", options });

    expect(markup).toContain('aria-label="Connect available-org"');
    expect(markup).toContain('aria-label="Open member-org in Samebase"');
    expect(markup).toContain('href="/org/Member-Org/vaults"');
    expect(markup).toContain(
      "Someone already connected this GitHub organization to Samebase. Ask a Samebase organization owner to invite you.",
    );
    expect(markup).toContain("A GitHub organization owner must connect this installation.");
    expect(markup).toContain("Install GitHub App");
  });

  it("shows only the action that can recover each unavailable state", () => {
    const loadingMarkup = renderPage({ status: "loading" });
    expect(loadingMarkup).toContain('aria-label="Loading GitHub App installations"');
    expect(loadingMarkup).not.toContain("Authorize GitHub");

    const signInMarkup = renderPage({ status: "github_sign_in_required" });
    expect(signInMarkup).toContain('href="/settings#sign-in-methods"');
    expect(signInMarkup).not.toContain("Authorize GitHub");

    const authorizationMarkup = renderPage({ status: "authorization_required" });
    expect(authorizationMarkup).toContain("Authorize GitHub");
    expect(authorizationMarkup).not.toContain("Account settings");

    const failedMarkup = renderPage({ status: "load_failed" });
    expect(failedMarkup).toContain("Could not load GitHub App installations.");
    expect(failedMarkup).toContain("Try again");
    expect(failedMarkup).not.toContain("Authorize GitHub");
  });

  it("offers GitHub App installation when the authorized list is empty", () => {
    const emptyMarkup = renderPage({ status: "ready", options: [] });
    expect(emptyMarkup).toContain("No GitHub App installations");
    expect(emptyMarkup).toContain("Install GitHub App");
    expect(emptyMarkup).toContain(
      "Install the Samebase GitHub App for your GitHub account or an organization you manage.",
    );
  });
});
