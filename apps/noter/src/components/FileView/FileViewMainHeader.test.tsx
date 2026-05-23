import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";

import { FileViewMainHeader } from "./FileViewMainHeader";

describe("FileViewMainHeader", () => {
  it("renders the route URL editor beside quick open", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/octo/repo/main/docs/README.md?diff"]}>
        <FileViewMainHeader headerTitle="docs" onQuickOpen={() => {}} />
      </TestRouterProvider>,
    );

    expect(markup).toContain("docs");
    expect(markup).toContain('aria-label="Quick Open"');
    expect(markup).toContain('data-testid="route-url-editor-input"');
    expect(markup).toContain(
      'title="https://noter.local/vault/octo/repo/main/docs/README.md?diff"',
    );
    expect(markup).toContain(
      'value="https://noter.local/vault/octo/repo/main/docs/README.md?diff"',
    );
  });
});
