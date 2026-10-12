// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
  ConvexComponentTree,
  type ConvexComponentsObservation,
} from "@/components/RepositoryConvexComponentsView";

const observation = {
  deploymentName: "tidy-otter-512",
  components: [
    {
      id: "mail-id",
      name: "mail",
      path: "mail",
      state: "active",
      httpPrefix: null,
      fileCount: 0,
      tables: [],
      functions: [],
      crons: [],
    },
    {
      id: "workflow-id",
      name: "workflow",
      path: "workflow",
      state: "active",
      httpPrefix: null,
      fileCount: 0,
      tables: [{ name: "workflows", documentCount: 1 }],
      functions: [
        { module: "workflow.js", name: "create", type: "Mutation", visibility: "public" },
      ],
      crons: [],
    },
    {
      id: "workpool-id",
      name: "workpool",
      path: "workflow/workpool",
      state: "unmounted",
      httpPrefix: "/workpool/",
      fileCount: 2,
      tables: [],
      functions: [],
      crons: [
        {
          name: "healthcheck",
          functionPath: "crons.js:healthcheck",
          schedule: '{"seconds":"1800","type":"interval"}',
        },
      ],
    },
  ],
} satisfies ConvexComponentsObservation;

function renderTree() {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ConvexComponentTree observation={observation} />);
  return container;
}

describe("ConvexComponentTree", () => {
  it("nests each component under the component of its parent path", () => {
    const outline = Array.from(renderTree().querySelectorAll("li"), (item) => {
      let depth = 0;
      for (
        let parent = item.parentElement?.closest("li");
        parent;
        parent = parent.parentElement?.closest("li")
      ) {
        depth += 1;
      }
      return `${"  ".repeat(depth)}${item.querySelector(":scope > details > summary")?.textContent}`;
    });

    expect(outline).toEqual([
      "mail0 functions · 0 tables",
      "workflow1 function · 1 table",
      "  workpoolunmounted · 0 functions · 0 tables",
    ]);
  });

  it("lists the metadata of each component in its details", () => {
    const details = Array.from(renderTree().querySelectorAll("details > dl"), (list) =>
      Array.from(list.children, (child) => child.textContent),
    );

    expect(details).toEqual([
      ["ID", "mail-id", "Files", "0"],
      [
        "ID",
        "workflow-id",
        "Files",
        "0",
        "Tables",
        "workflows1 document",
        "Functions",
        "workflow.js:createMutation, public",
      ],
      [
        "ID",
        "workpool-id",
        "HTTP prefix",
        "/workpool/",
        "Files",
        "2",
        "Crons",
        'healthcheckcrons.js:healthcheck {"seconds":"1800","type":"interval"}',
      ],
    ]);
  });
});
