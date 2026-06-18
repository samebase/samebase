import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import { LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL } from "@/routeSearch/landingPreview";

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/MarkdownLandingDocument", () => ({
  MarkdownLandingDocument: ({ markdown }: { markdown: string }) => <article>{markdown}</article>,
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { searchStr: string }) => string }) =>
    select({ searchStr: "" }),
}));

vi.mock("@/components/workspace-layout-v2/WorkspacePaneRuntime", () => ({
  useWorkspacePaneActions: () => ({
    setMobilePane: () => {},
  }),
  useWorkspacePaneState: () => ({
    isMobile: false,
    mobilePane: "main",
  }),
}));

describe("LandingMarkdownPreviewPage", () => {
  it("renders the English preview by default", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage />);

    expect(markup).toContain("Deploy a production-ready");
    expect(markup).toContain("Language: English");
    expect(markup).toContain(LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL);
  });

  it("renders the Romanian preview when selected", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage language="ro" />);

    expect(markup).toContain("Lansează o aplicație web");
    expect(markup).toContain("/landing-preview/step-1-create-accounts.mp4");
  });
});
