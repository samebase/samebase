// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
  ConvexComponentTree,
  type ConvexComponentsObservation,
} from "@/components/RepositoryConvexComponentsView";

describe("ConvexComponentTree", () => {
  it("nests each component under the component of its parent path", () => {
    const observation = {
      deploymentName: "tidy-otter-512",
      components: [
        { id: "mail-id", name: "mail", path: "mail", state: "active" },
        { id: "workflow-id", name: "workflow", path: "workflow", state: "active" },
        { id: "workpool-id", name: "workpool", path: "workflow/workpool", state: "unmounted" },
      ],
    } satisfies ConvexComponentsObservation;
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ConvexComponentTree observation={observation} />);

    const outline = Array.from(container.querySelectorAll("li"), (item) => {
      let depth = 0;
      for (
        let parent = item.parentElement?.closest("li");
        parent;
        parent = parent.parentElement?.closest("li")
      ) {
        depth += 1;
      }
      return `${"  ".repeat(depth)}${item.firstElementChild?.textContent}`;
    });
    expect(outline).toEqual(["mail", "workflow", "  workpoolunmounted"]);
  });
});
