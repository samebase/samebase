import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  WorkspaceLayoutV2LocalStoreState,
  WorkspacePaneState,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";

vi.mock("@/components/LandingCopy", () => ({
  LandingCopy: () => <div>Landing copy</div>,
}));

vi.mock("@/components/PublicLandingAuthControls", () => ({
  PublicLandingAuthControls: () => <div>Auth controls</div>,
}));

vi.mock("@/components/logo/PublicLandingLogo", () => ({
  PublicLandingLogo: () => <div>Logo</div>,
}));

vi.mock("@/components/workspace-layout-v2/WorkspacePaneRuntime", () => ({
  useWorkspaceLayoutV2Selector: (selector: (state: WorkspaceLayoutV2LocalStoreState) => unknown) =>
    selector({
      activeResizeSide: null,
      mobile: {
        grip: { kind: "idle" },
        isPaneSettled: true,
        paneNavigationRequest: null,
        paneScrollProgress: 0,
      },
      viewportSize: { heightPx: 0, widthPx: 0 },
    }),
  useWorkspacePaneState: (): WorkspacePaneState => ({
    isMobile: false,
    leftDesktopOpen: false,
    leftDesktopWidthPx: 240,
    leftMobileWidthPx: 240,
    mobilePane: "main",
    mobileSurface: { kind: "unmerged" },
    rightDesktopOpen: true,
    rightDesktopWidthPx: 288,
    rightMobileWidthPx: 288,
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
