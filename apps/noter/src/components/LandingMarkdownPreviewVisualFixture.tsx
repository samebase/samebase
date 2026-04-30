import { Layout } from "@/Layout";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import { TestRouterProvider } from "@/test/TestRouterProvider";

export type LandingMarkdownPreviewVisualMode = "landing-markdown-preview";

export function LandingMarkdownPreviewVisualFixture() {
  return (
    <TestRouterProvider initialEntries={["/landing-preview?dev"]}>
      <Layout>
        <LandingMarkdownPreviewPage />
      </Layout>
    </TestRouterProvider>
  );
}
