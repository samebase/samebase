import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  OrganizationsPageView,
  type OrganizationConnectionOption,
  type OrganizationDiscoveryState,
  type OrganizationsPageOrganization,
  type OrganizationsPageState,
} from "./OrganizationsPage";

const organizations = [
  {
    githubOwnerId: "member-owner",
    githubOwnerType: "organization",
    githubOwnerLogin: "Member-Org",
  },
] satisfies OrganizationsPageOrganization[];

const options = [
  {
    status: "connect",
    installationId: "101",
    githubOwnerType: "organization",
    githubOwnerLogin: "available-org",
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
] satisfies OrganizationConnectionOption[];

function renderPage(state: OrganizationsPageState) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/org"]}>
      <OrganizationsPageView
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

function readyState(discovery: OrganizationDiscoveryState): OrganizationsPageState {
  return { status: "ready", organizations, discovery };
}

describe("OrganizationsPageView", () => {
  it("shows memberships before GitHub connection choices", () => {
    const markup = renderPage(readyState({ status: "ready", options }));

    expect(markup).toContain("Organizations");
    expect(markup.indexOf("Member-Org")).toBeLessThan(markup.indexOf("available-org"));
    expect(markup).toContain('aria-label="Open Member-Org in Samebase"');
    expect(markup).toContain('href="/org/Member-Org/repositories"');
    expect(markup).toContain('aria-label="Connect available-org"');
    expect(markup).toContain(
      "Someone already connected this GitHub organization to Samebase. Ask a Samebase organization owner to invite you.",
    );
    expect(markup).toContain("A GitHub organization owner must connect this installation.");
    expect(markup).toContain("Install GitHub App");
  });

  it.each([
    ["loading", { status: "loading" }],
    ["GitHub sign-in required", { status: "github_sign_in_required" }],
    ["GitHub authorization required", { status: "authorization_required" }],
    ["load failure", { status: "load_failed" }],
  ] satisfies ReadonlyArray<readonly [string, OrganizationDiscoveryState]>)(
    "keeps memberships visible during %s",
    (_name, discovery) => {
      const markup = renderPage(readyState(discovery));

      expect(markup).toContain('aria-label="Open Member-Org in Samebase"');
      expect(markup).toContain('href="/org/Member-Org/repositories"');
    },
  );

  it("shows only the action that can recover each unavailable discovery state", () => {
    const loadingMarkup = renderPage(readyState({ status: "loading" }));
    expect(loadingMarkup).toContain('aria-label="Loading GitHub App installations"');
    expect(loadingMarkup).not.toContain("Authorize GitHub");

    const signInMarkup = renderPage(readyState({ status: "github_sign_in_required" }));
    expect(signInMarkup).toContain(
      "Sign out and sign in with GitHub before you add an organization.",
    );
    expect(signInMarkup).not.toContain("Authorize GitHub");

    const authorizationMarkup = renderPage(readyState({ status: "authorization_required" }));
    expect(authorizationMarkup).toContain("Authorize GitHub");
    expect(authorizationMarkup).not.toContain("Account settings");

    const failedMarkup = renderPage(readyState({ status: "load_failed" }));
    expect(failedMarkup).toContain("Could not load GitHub App installations.");
    expect(failedMarkup).toContain("Try again");
    expect(failedMarkup).not.toContain("Authorize GitHub");
  });

  it("offers GitHub App installation when no organizations or choices exist", () => {
    const emptyMarkup = renderPage({
      status: "ready",
      organizations: [],
      discovery: { status: "ready", options: [] },
    });
    expect(emptyMarkup).toContain("No organizations");
    expect(emptyMarkup).toContain("Install GitHub App");
    expect(emptyMarkup).toContain(
      "Install the Samebase GitHub App for your GitHub account or an organization you manage.",
    );
  });

  it("waits for the membership list before it presents the directory", () => {
    const markup = renderPage({ status: "loading" });

    expect(markup).toContain('aria-label="Loading organizations"');
    expect(markup).not.toContain("Member-Org");
  });
});
