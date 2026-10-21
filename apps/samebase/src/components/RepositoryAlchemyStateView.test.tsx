// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
  observedAlchemyOutputs,
  observedAlchemyResourceValues,
} from "../../convex/repository/fixtures/observedAlchemyState";
import {
  AlchemyStateTree,
  type AlchemyStateObservation,
} from "@/components/RepositoryAlchemyStateView";

const previewStage = "renovate-hono-4-x-73ca1d1d";

/** The fixture types its captured values as `unknown`, and every one of them is JSON text. */
function fixtureText(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected the captured Alchemy state value to be text.");
  }
  return value;
}

const observation = {
  store: "found",
  stack: "samebase/base-alchemy",
  stages: [
    {
      name: "main",
      resources: [
        {
          fqn: "Deployment",
          value: fixtureText(observedAlchemyResourceValues["main"]["Deployment"]),
        },
      ],
      output: fixtureText(observedAlchemyOutputs["main"]),
    },
    {
      name: previewStage,
      resources: [
        {
          fqn: "Deployment",
          value: fixtureText(observedAlchemyResourceValues[previewStage]["Deployment"]),
        },
        {
          fqn: "PreviewComment",
          value: fixtureText(observedAlchemyResourceValues[previewStage]["PreviewComment"]),
        },
      ],
      output: fixtureText(observedAlchemyOutputs[previewStage]),
    },
  ],
} satisfies AlchemyStateObservation;

function renderTree(tree: AlchemyStateObservation) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<AlchemyStateTree observation={tree} />);
  return container;
}

describe("AlchemyStateTree", () => {
  it("lists the stages of the stack and names the status and provider of each resource", () => {
    const container = renderTree(observation);

    expect(container.firstElementChild?.firstElementChild?.textContent).toBe(
      "samebase/base-alchemy",
    );
    expect(
      Array.from(container.querySelectorAll("ul > li > details > summary"), (summary) => {
        return summary.textContent;
      }),
    ).toEqual(["main1 resource", `${previewStage}2 resources`]);
    expect(
      Array.from(container.querySelectorAll("details > dl"), (list) =>
        Array.from(list.children, (child) => child.textContent),
      ),
    ).toEqual([
      [
        "Resources",
        "Deploymentupdated, Convex.Deployment",
        "Output",
        "urlhttps://ideal-dolphin-15.convex.site",
      ],
      [
        "Resources",
        "Deploymentcreated, Convex.DeploymentPreviewCommentcreated, GitHub.Comment",
        "Output",
        "urlhttps://insightful-perch-284.convex.site",
      ],
    ]);
  });

  it("shows only the key of a secret in the output", () => {
    // The action already replaces secret values with null, and the view must still hide a value that reaches it.
    const container = renderTree({
      store: "found",
      stack: "samebase/base-alchemy",
      stages: [
        {
          name: "main",
          resources: [],
          output:
            '{"url":"https://ideal-dolphin-15.convex.site","deployKey":{"__redacted__":"prod:ideal-dolphin-15|state-secret-value"},"nested":{"token":{"__redacted__":null}}}',
        },
      ],
    });

    expect(container.innerHTML).not.toContain("state-secret-value");
    expect(container.innerHTML).not.toContain("__redacted__");
    expect(
      Array.from(container.querySelectorAll("dl > dd:last-child > div"), (entry) => {
        return Array.from(entry.children, (part) => part.textContent);
      }),
    ).toEqual([["url", "https://ideal-dolphin-15.convex.site"], ["deployKey"], ["nested.token"]]);
  });

  it("shows a stack without stages", () => {
    expect(
      renderTree({ store: "found", stack: "samebase/base-alchemy", stages: [] }).textContent,
    ).toBe("samebase/base-alchemyNo Alchemy state.");
  });

  it("shows a team without a store", () => {
    expect(renderTree({ store: "missing" }).textContent).toBe(
      "No Alchemy state store in this team yet.",
    );
  });
});
