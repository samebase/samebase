import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MachinePageScrollShell } from "./MachinePageScrollShell";

describe("MachinePageScrollShell", () => {
  it("renders a full-height scroll container for machine routes", () => {
    const markup = renderToStaticMarkup(
      <MachinePageScrollShell>
        <div>scroll target</div>
      </MachinePageScrollShell>,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="flex h-full min-h-0 flex-col overflow-y-auto"><div>scroll target</div></div>"`,
    );
  });
});
