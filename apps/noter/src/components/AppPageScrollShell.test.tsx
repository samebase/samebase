import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppPageScrollShell } from "./AppPageScrollShell";

describe("AppPageScrollShell", () => {
  it("renders a full-height inner scroll container when a route needs one", () => {
    const markup = renderToStaticMarkup(
      <AppPageScrollShell>
        <div>scroll target</div>
      </AppPageScrollShell>,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto"><div>scroll target</div></div>"`,
    );
  });

  it("can defer scrolling to the browser document for public routes", () => {
    const markup = renderToStaticMarkup(
      <AppPageScrollShell scrollMode="document">
        <div>scroll target</div>
      </AppPageScrollShell>,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="flex flex-1 flex-col"><div>scroll target</div></div>"`,
    );
  });
});
