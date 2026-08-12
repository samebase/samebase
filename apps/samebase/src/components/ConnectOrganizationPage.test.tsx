import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  ConnectOrganizationPageView,
  type ConnectOrganizationOption,
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
  {
    status: "github_sign_in_required",
    installationId: "105",
    githubOwnerType: "user",
    githubOwnerLogin: "personal-owner",
  },
  {
    status: "github_sign_in_mismatch",
    installationId: "106",
    githubOwnerType: "user",
    githubOwnerLogin: "different-owner",
  },
] satisfies ConnectOrganizationOption[];

function renderPage(pageOptions: readonly ConnectOrganizationOption[] | null, session?: string) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/connect-organization"]}>
      <ConnectOrganizationPageView
        error={null}
        isAuthorizing={false}
        isInstalling={false}
        loading={false}
        onAuthorize={() => {}}
        onConnect={() => {}}
        onInstall={() => {}}
        options={pageOptions}
        pendingInstallationId={null}
        session={session}
      />
    </TestRouterProvider>,
  );
}

describe("ConnectOrganizationPageView", () => {
  it("shows the action and explanation for each installation state", () => {
    const markup = renderPage(options, "session");

    expect(markup).toContain('aria-label="Connect available-org"');
    expect(markup).toContain('aria-label="Open member-org in Samebase"');
    expect(markup).toContain('href="/org/Member-Org/vaults"');
    expect(markup).toContain(
      "Someone already connected this GitHub organization to Samebase. Ask a Samebase organization owner to invite you.",
    );
    expect(markup).toContain("A GitHub organization owner must connect this installation.");
    expect(markup).toContain(
      "Add this GitHub account as a Samebase sign-in method before you connect it.",
    );
    expect(markup).toContain(
      "This GitHub account does not match your Samebase GitHub sign-in method.",
    );
    expect(markup).toContain("Install for another account or organization");
  });

  it("starts with GitHub authorization and gives an installation action for an empty list", () => {
    expect(renderPage(null)).toContain("Authorize GitHub");

    const emptyMarkup = renderPage([], "session");
    expect(emptyMarkup).toContain("No GitHub App installations");
    expect(emptyMarkup).toContain("Install GitHub App");
  });
});
