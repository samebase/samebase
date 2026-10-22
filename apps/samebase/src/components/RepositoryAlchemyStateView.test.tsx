// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { isRecord } from "../../convex/jsonUtils";
import { observedAlchemyStackReply } from "../../convex/repository/fixtures/observedAlchemyState";
import { observedSamebaseStackReply } from "../../convex/repository/fixtures/observedSamebaseAlchemyState";
import {
  AlchemyStateTree,
  type AlchemyStateObservation,
} from "@/components/RepositoryAlchemyStateView";

type AlchemyStage = Extract<
  AlchemyStateObservation,
  { store: "found" }
>["stacks"][number]["stages"][number];

const [, , prod] = observedAlchemyStackReply.value.stages;
const [, pr1768, samebaseProd] = observedSamebaseStackReply.value.stages;

/** The run record of the captured pr-1768 output, as `observe` returns it. */
const pr1768Record = {
  version: 1,
  repository: "samebase/samebase",
  stackFile: "alchemy.run.ts",
  branch: "alchemy-root-stack",
  pullRequest: 1768,
  headCommit: "429c1218a16d2ee74b9da68d684dc460a0a67ce8",
  runUrl: "https://github.com/samebase/samebase/actions/runs/39756039340/attempts/1",
  source: "github-actions",
  recordedAt: "2026-10-22T09:34:35.577Z",
} as const;

/** The run record of the captured samebase/samebase prod output, as `observe` returns it. */
const prodRecord = {
  version: 1,
  repository: "samebase/samebase",
  stackFile: "apps/samebase/alchemy.run.ts",
  branch: "main",
  pullRequest: null,
  headCommit: "1592243a49970f5c5142009b7ca7b2d71d31f104",
  runUrl: "https://github.com/samebase/samebase/actions/runs/39746887572/attempts/1",
  source: "github-actions",
  recordedAt: "2026-10-22T08:22:58.152Z",
} as const;

const pr1768Stage: AlchemyStage = {
  name: pr1768.stage,
  record: pr1768Record,
  resources: pr1768.resources,
  output: '{"url":"https://aware-bobcat-542.convex.site"}',
};

/** An observation of one stack with `stages`. */
function oneStack(name: string, stages: AlchemyStage[]): AlchemyStateObservation {
  return { store: "found", liveDeployments: [], stacks: [{ name, stages }] };
}

function renderTree(tree: AlchemyStateObservation) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<AlchemyStateTree observation={tree} />);
  return container;
}

/** The text of each `dt` and `dd` of each stage. */
function stageDetails(container: HTMLElement) {
  return Array.from(container.querySelectorAll("details > dl"), (list) =>
    Array.from(list.children, (child) => child.textContent),
  );
}

/**
The captured samebase/base-alchemy `prod` Deployment row with `props.rootDir` and `props.source`
set, in a stage of the stack file `stackFile`.
*/
function deploymentWith(
  stackFile: string,
  rootDir: string | undefined,
  source: unknown,
): AlchemyStateObservation {
  const deployment: unknown = JSON.parse(prod.resources[0].value);
  if (!isRecord(deployment) || !isRecord(deployment["props"])) {
    throw new Error("Expected the captured Deployment props.");
  }
  deployment["props"]["rootDir"] = rootDir;
  deployment["props"]["source"] = source;
  return oneStack("samebase/samebase", [
    {
      name: "prod",
      record: { ...prodRecord, stackFile },
      resources: [{ fqn: "Deployment", value: JSON.stringify(deployment) }],
      output: "{}",
    },
  ]);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AlchemyStateTree", () => {
  it("labels each stage with its run record and each Convex deployment with its code", () => {
    vi.useFakeTimers({ now: new Date("2026-10-22T09:46:35.577Z") });
    const container = renderTree(oneStack("samebase/samebase", [pr1768Stage]));

    expect(container.firstElementChild?.firstElementChild?.firstElementChild?.textContent).toBe(
      "samebase/samebase",
    );
    expect(
      Array.from(container.querySelectorAll("ul > li > details > summary"), (summary) => {
        return summary.textContent;
      }),
    ).toEqual(["pr-17683 resources"]);
    expect(stageDetails(container)).toEqual([
      [
        "Pull request",
        "#1768",
        "Branch",
        "alchemy-root-stack",
        "Commit",
        "429c121",
        "Run",
        "GitHub Actions12m ago",
        "Convex",
        "aware-bobcat-542apps/samebase/convex",
        "Resources",
        "PreviewCommentcreated, GitHub.CommentProjectupdated, Convex.ProjectSitecreated, Convex.Deployment",
        "Output",
        "urlhttps://aware-bobcat-542.convex.site",
      ],
    ]);
    expect(
      Array.from(container.querySelectorAll("details > dl a"), (link) => [
        link.textContent,
        link.getAttribute("href"),
      ]),
    ).toEqual([
      ["#1768", "https://github.com/samebase/samebase/pull/1768"],
      [
        "429c121",
        "https://github.com/samebase/samebase/commit/429c1218a16d2ee74b9da68d684dc460a0a67ce8",
      ],
      ["GitHub Actions", pr1768Record.runUrl],
      ["aware-bobcat-542", "https://aware-bobcat-542.convex.cloud"],
    ]);
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(pr1768Record.recordedAt);
  });

  it("shows each stack of the repository with the resources that its rows place", () => {
    // The captured samebase/samebase stages: the Site row of pr-1768 has rootDir, and the Site
    // row of prod has none, so prod lists only its Workers. The stack of a folder holds no row yet.
    const container = renderTree({
      store: "found",
      liveDeployments: [],
      stacks: [
        {
          name: "samebase/samebase",
          stages: [
            pr1768Stage,
            {
              name: samebaseProd.stage,
              record: prodRecord,
              resources: samebaseProd.resources,
              output: '{"url":"https://clear-butterfly-858.convex.site"}',
            },
          ],
        },
        {
          name: "samebase/samebase/apps/sidebars-example",
          stages: [
            {
              name: "prod",
              record: { ...prodRecord, stackFile: "apps/sidebars-example/alchemy.run.ts" },
              resources: [],
              output: "{}",
            },
          ],
        },
      ],
    });

    expect(
      Array.from(container.querySelectorAll(".font-medium"), (name) => name.textContent),
    ).toEqual(["samebase/samebase", "samebase/samebase/apps/sidebars-example"]);
    const [pr1768Details, prodDetails] = stageDetails(container);
    expect(pr1768Details[pr1768Details.indexOf("Convex") + 1]).toBe(
      "aware-bobcat-542apps/samebase/convex",
    );
    expect(prodDetails).not.toContain("Convex");
    expect(prodDetails[prodDetails.indexOf("Workers") + 1]).toBe(
      "samebase-domainssamebase-posthog-proxy",
    );
  });

  it.each([
    ["alchemy.run.ts", ".", { path: "./convex" }, "ideal-dolphin-15convex"],
    ["alchemy.run.ts", ".", "./convex", "ideal-dolphin-15convex"],
    ["apps/x/alchemy.run.ts", ".", { path: "./convex" }, "ideal-dolphin-15apps/x/convex"],
    ["alchemy.run.ts", ".", ".", "ideal-dolphin-15."],
    ["apps/x/alchemy.run.ts", ".", "../../convex/", "ideal-dolphin-15convex"],
    ["alchemy.run.ts", ".", "../convex", "ideal-dolphin-15"],
    ["alchemy.run.ts", ".", undefined, "ideal-dolphin-15"],
    ["alchemy.run.ts", "apps/x", "./convex", "ideal-dolphin-15apps/x/convex"],
    ["apps/x/alchemy.run.ts", "../y", "./convex", "ideal-dolphin-15apps/y/convex"],
  ])(
    "derives the code location from %s, rootDir %j, and source %j",
    (stackFile, rootDir, source, convex) => {
      const details = stageDetails(renderTree(deploymentWith(stackFile, rootDir, source)))[0] ?? [];

      expect(details[details.indexOf("Convex") + 1]).toBe(convex);
    },
  );

  it.each([
    ["without rootDir", undefined],
    ["with a rootDir outside the repository", "../out"],
  ])("leaves out a Convex deployment %s", (_case, rootDir) => {
    expect(
      stageDetails(renderTree(deploymentWith("alchemy.run.ts", rootDir, "./convex")))[0],
    ).not.toContain("Convex");
  });

  it("links each Cloudflare Worker to its URL", () => {
    // The `main` Worker row, verbatim, from section 4 of
    // research/2026-10-21-alchemy-state-rows-for-workers-and-convex.md (alchemy 2.0.0-beta.83).
    const container = renderTree(
      oneStack("samebase/tmp-k7m2-rows", [
        {
          name: "prod",
          record: {
            ...prodRecord,
            repository: "samebase/tmp-k7m2-rows",
            stackFile: "alchemy.run.ts",
          },
          resources: [
            {
              fqn: "Worker",
              value:
                '{"status":"created","fqn":"Worker","logicalId":"Worker","instanceId":"4fb5acd8a74d8a46633a8e57084e0bc1","resourceType":"Cloudflare.Worker","props":{"name":"tmp-k7m2-rows","main":"./worker.ts","env":{"CONVEX_URL":"https://modest-guanaco-252.convex.cloud"},"isExternal":true},"attr":{"workerId":"6d2434039c4343a9a02300ba85841b70","workerName":"tmp-k7m2-rows","logpush":false,"url":"https://tmp-k7m2-rows.pfp.workers.dev","urls":["https://tmp-k7m2-rows.pfp.workers.dev"],"tags":["alchemy:stack:samebase/tmp-k7m2-rows","alchemy:stage:main","alchemy:id:Worker"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[],"crons":[],"tailConsumers":[],"hash":{"bundle":"b132832cbda33e15a9cffc4ff168139206ddccf97b0a7c2230801d3710200e85","metadata":"6692e8262512d066c344158cd4e091a1287954eb8b43208b87b336715b99bb65"}},"bindings":[{"sid":"CONVEX_URL","data":{"bindings":[{"type":"plain_text","name":"CONVEX_URL","text":"https://modest-guanaco-252.convex.cloud"}]}}],"providerVersion":0,"downstream":[],"removalPolicy":"destroy","providerMode":"live"}',
            },
          ],
          output: "{}",
        },
      ]),
    );

    const details = stageDetails(container)[0] ?? [];
    expect(details[details.indexOf("Workers") + 1]).toBe("tmp-k7m2-rows");
    expect(
      container.querySelector('a[href="https://tmp-k7m2-rows.pfp.workers.dev"]')?.textContent,
    ).toBe("tmp-k7m2-rows");
  });

  it("shows only the key of a secret in the output", () => {
    // The action already replaces secret values with null, and the view must still hide a value that reaches it.
    const container = renderTree(
      oneStack("samebase/samebase", [
        {
          name: "prod",
          record: prodRecord,
          resources: [],
          output:
            '{"url":"https://clear-butterfly-858.convex.site","deployKey":{"__redacted__":"prod:clear-butterfly-858|state-secret-value"},"nested":{"token":{"__redacted__":null}}}',
        },
      ]),
    );

    expect(container.innerHTML).not.toContain("state-secret-value");
    expect(container.innerHTML).not.toContain("__redacted__");
    expect(
      Array.from(container.querySelectorAll("dl > dd:last-child > div"), (entry) => {
        return Array.from(entry.children, (part) => part.textContent);
      }),
    ).toEqual([
      ["url", "https://clear-butterfly-858.convex.site"],
      ["deployKey"],
      ["nested.token"],
    ]);
  });

  it("shows a repository without stacks", () => {
    expect(renderTree({ store: "found", liveDeployments: [], stacks: [] }).textContent).toBe(
      "No Alchemy state.",
    );
  });

  it("shows a team without a store", () => {
    expect(renderTree({ store: "missing" }).textContent).toBe(
      "No Alchemy state store in this team yet.",
    );
  });
});
