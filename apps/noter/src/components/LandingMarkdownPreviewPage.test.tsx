import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";

vi.mock("@/Layout", () => ({
  PublicLayoutShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/MarkdownLandingDocument", () => ({
  MarkdownLandingDocument: ({ markdown }: { markdown: string }) => (
    <article>{markdown}</article>
  ),
}));

describe("LandingMarkdownPreviewPage", () => {
  it("renders the English preview by default", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage />);

    expect(markup).toContain("Deploy a production-ready");
  });

  it("renders the Romanian preview when selected", () => {
    const markup = renderToStaticMarkup(
      <LandingMarkdownPreviewPage language="ro" />,
    );

    expect(markup).toContain("Lansează o aplicație web");
    expect(markup).toContain("/landing-preview/step-1-create-accounts.mp4");
  });
});
