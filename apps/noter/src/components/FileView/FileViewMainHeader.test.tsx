import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { FileViewMainHeader } from "./FileViewMainHeader";

describe("FileViewMainHeader", () => {
  it("renders the current route URL as plain header text", () => {
    const markup = renderToStaticMarkup(
      <FileViewMainHeader
        currentUrl="/vault/octo/repo/main/docs/README.md?diff"
        headerTitle="docs"
        onQuickOpen={() => {}}
      />,
    );

    expect(markup).toContain("docs");
    expect(markup).toContain('data-testid="file-view-main-header-url"');
    expect(markup).toContain("/vault/octo/repo/main/docs/README.md?diff");
  });
});
