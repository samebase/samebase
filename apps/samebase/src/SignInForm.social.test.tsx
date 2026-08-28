import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { WorkspaceLayoutPresentation } from "@samebase/workspace-layout/runtime";

vi.mock("@/components/LandingCopy", () => ({
  LandingCopy: () => <div>Landing copy</div>,
}));

vi.mock("@/components/PublicLandingAuthControls", () => ({
  PublicLandingAuthControls: () => <div>Auth controls</div>,
}));

vi.mock("@/components/logo/PublicLandingLogo", () => ({
  PublicLandingLogo: () => <div>Logo</div>,
}));

vi.mock("@samebase/workspace-layout/runtime", () => ({
  useWorkspaceLayoutPresentation: (): WorkspaceLayoutPresentation => ({
    isMobile: false,
    mobileMergeProgress: null,
    mobilePane: "main",
    mobilePaneScrollProgress: 0,
  }),
}));

vi.mock("@/routeSearch/root", () => ({
  replaceRootLogoRouteSearch: (currentSearch: Record<string, unknown>) => currentSearch,
  useRootRouteSearch: () => ({}),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children?: ReactNode; className?: string; to: string }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

import { SignInForm } from "@/SignInForm";
import { PublicSignupClosedNotice } from "@/components/PublicSignupClosedNotice";

const SAMEBASE_X_PROFILE_URL = "https://x.com/samebasecom";

describe("public Samebase social links", () => {
  it("renders the Samebase X profile link on the public landing form", () => {
    const markup = renderToStaticMarkup(
      <SignInForm
        authPlacement="sidebar"
        landingPageMarkdown="Samebase"
        logo="classic"
        topNotice={null}
      />,
    );

    expect(markup).toContain(`href="${SAMEBASE_X_PROFILE_URL}"`);
    expect(markup).toContain(SAMEBASE_X_PROFILE_URL);
  });

  it("renders the Samebase X profile link in the closed signup notice", () => {
    const markup = renderToStaticMarkup(<PublicSignupClosedNotice />);

    expect(markup).toContain(`href="${SAMEBASE_X_PROFILE_URL}"`);
    expect(markup).toContain("@samebasecom");
    expect(markup).not.toContain("pending access");
  });
});
