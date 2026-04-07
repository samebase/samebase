import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { AppPageScrollShell } from "./AppPageScrollShell";

describe("AppPageScrollShell", () => {
  it("renders a full-height scroll container for routes that need scrolling", () => {
    const markup = renderToStaticMarkup(
      <AppPageScrollShell>
        <div>scroll target</div>
      </AppPageScrollShell>,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto"><div>scroll target</div></div>"`,
    );
  });
});
