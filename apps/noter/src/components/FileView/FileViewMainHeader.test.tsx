import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { FileViewMainHeader } from "./FileViewMainHeader";

describe("FileViewMainHeader", () => {
  it("renders the route header accessory beside quick open", () => {
    const markup = renderToStaticMarkup(
      <FileViewMainHeader headerTitle="docs" onQuickOpen={() => {}} />,
    );

    expect(markup).toContain("docs");
    expect(markup).toContain('aria-label="Quick Open"');
  });
});
