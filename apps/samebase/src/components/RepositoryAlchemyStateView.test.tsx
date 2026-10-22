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

const [pr24, , prod] = observedAlchemyStackReply.value.stages;

/** The run record of the captured `prod` output, as `observe` returns it. */
const prodRecord = {
  version: 1,
  repository: "samebase/base-alchemy",
  stackFile: "alchemy.run.ts",
  branch: "main",
  pullRequest: null,
  headCommit: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
  runUrl: "https://github.com/samebase/base-alchemy/actions/runs/39666079880/attempts/1",
  source: "github-actions",
  recordedAt: "2026-10-21T19:58:06.882Z",
} as const;

/** An observation of one stack with `stages`. */
function oneStack(name: string, stages: AlchemyStage[]): AlchemyStateObservation {
  return { store: "found", liveDeployments: [], stacks: [{ name, stages }] };
}

const observation = oneStack("samebase/base-alchemy", [
  { name: pr24.stage, run: { state: "none" }, resources: pr24.resources, output: pr24.output },
  {
    name: prod.stage,
    run: { state: "recorded", record: prodRecord },
    resources: prod.resources,
    output: '{"url":"https://ideal-dolphin-15.convex.site"}',
  },
]);

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

/** The captured `prod` stage with another stack file and Deployment `props.rootDir` and `source`. */
function prodWithSource(
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
  return oneStack("samebase/base-alchemy", [
    {
      name: prod.stage,
      run: { state: "recorded", record: { ...prodRecord, stackFile } },
      resources: [{ fqn: "Deployment", value: JSON.stringify(deployment) }],
      output: null,
    },
  ]);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AlchemyStateTree", () => {
  it("labels each stage with its run record and each Convex deployment with its code", () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T20:10:08.576Z") });
    const container = renderTree(observation);

    expect(container.firstElementChild?.firstElementChild?.firstElementChild?.textContent).toBe(
      "samebase/base-alchemy",
    );
    expect(
      Array.from(container.querySelectorAll("ul > li > details > summary"), (summary) => {
        return summary.textContent;
      }),
    ).toEqual(["pr-242 resources", "prod2 resources"]);
    expect(stageDetails(container)).toEqual([
      [
        "Run",
        "No run record",
        "Convex",
        "nautical-eagle-647",
        "Resources",
        "Deploymentcreated, Convex.DeploymentPreviewCommentcreated, GitHub.Comment",
        "Output",
        "urlhttps://nautical-eagle-647.convex.site",
      ],
      [
        "Branch",
        "main",
        "Commit",
        "a4d98f2",
        "Run",
        "GitHub Actions12m ago",
        "Convex",
        "ideal-dolphin-15convex",
        "Resources",
        "Deploymentupdated, Convex.DeploymentProjectupdated, Convex.Project",
        "Output",
        "urlhttps://ideal-dolphin-15.convex.site",
      ],
    ]);
    expect(
      Array.from(container.querySelectorAll("details > dl a"), (link) => [
        link.textContent,
        link.getAttribute("href"),
      ]),
    ).toEqual([
      ["nautical-eagle-647", "https://nautical-eagle-647.convex.cloud"],
      [
        "a4d98f2",
        "https://github.com/samebase/base-alchemy/commit/a4d98f2ad150dee07e19fa9c348e70240aca1dac",
      ],
      ["GitHub Actions", prodRecord.runUrl],
      ["ideal-dolphin-15", "https://ideal-dolphin-15.convex.cloud"],
    ]);
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(prodRecord.recordedAt);
  });

  it("shows each stack of the repository with the code location from rootDir", () => {
    // The captured samebase/samebase stack, as `observe` returns it: pr-1768 was deployed from the
    // root stack file with rootDir apps/samebase, and prod from apps/samebase/alchemy.run.ts
    // before rootDir. The stack of a folder holds no row yet, so its stage has none.
    const [, pr1768, samebaseProd] = observedSamebaseStackReply.value.stages;
    const container = renderTree({
      store: "found",
      liveDeployments: [],
      stacks: [
        {
          name: "samebase/samebase",
          stages: [
            {
              name: pr1768.stage,
              run: {
                state: "recorded",
                record: {
                  version: 1,
                  repository: "samebase/samebase",
                  stackFile: "alchemy.run.ts",
                  branch: "alchemy-root-stack",
                  pullRequest: 1768,
                  headCommit: "429c1218a16d2ee74b9da68d684dc460a0a67ce8",
                  runUrl:
                    "https://github.com/samebase/samebase/actions/runs/39756039340/attempts/1",
                  source: "github-actions",
                  recordedAt: "2026-10-22T09:34:35.577Z",
                },
              },
              resources: pr1768.resources,
              output: '{"url":"https://aware-bobcat-542.convex.site"}',
            },
            {
              name: samebaseProd.stage,
              run: {
                state: "recorded",
                record: {
                  ...prodRecord,
                  repository: "samebase/samebase",
                  stackFile: "apps/samebase/alchemy.run.ts",
                },
              },
              resources: samebaseProd.resources,
              output: null,
            },
          ],
        },
        {
          name: "samebase/samebase/apps/sidebars-example",
          stages: [{ name: "prod", run: { state: "none" }, resources: [], output: null }],
        },
      ],
    });

    expect(
      Array.from(container.querySelectorAll(".font-medium"), (name) => name.textContent),
    ).toEqual(["samebase/samebase", "samebase/samebase/apps/sidebars-example"]);
    const convex = stageDetails(container).flatMap((details) =>
      details.includes("Convex") ? [details[details.indexOf("Convex") + 1]] : [],
    );
    expect(convex).toEqual([
      "aware-bobcat-542apps/samebase/convex",
      "clear-butterfly-858apps/samebase/convex",
    ]);
    expect(stageDetails(container)[1]).toContain("samebase-domainssamebase-posthog-proxy");
  });

  it("links the pull request of a preview stage", () => {
    // Stage pr-23 was destroyed when samebase/base-alchemy#23 merged, before a capture. This is the
    // captured prod record with the values of the run that deployed pr-23.
    const container = renderTree(
      oneStack("samebase/base-alchemy", [
        {
          name: "pr-23",
          run: {
            state: "recorded",
            record: {
              ...prodRecord,
              branch: "alchemy-convex-0-7",
              pullRequest: 23,
              headCommit: "e63be559a98682f3b67090f9d9e294694e87fad2",
              runUrl:
                "https://github.com/samebase/base-alchemy/actions/runs/39665600937/attempts/1",
            },
          },
          resources: [],
          output: null,
        },
      ]),
    );

    expect(stageDetails(container)[0]?.slice(0, 4)).toEqual([
      "Pull request",
      "#23",
      "Branch",
      "alchemy-convex-0-7",
    ]);
    expect(container.querySelector("details > dl a")?.getAttribute("href")).toBe(
      "https://github.com/samebase/base-alchemy/pull/23",
    );
  });

  it.each([
    ["alchemy.run.ts", undefined, { path: "./convex" }, "ideal-dolphin-15convex"],
    ["alchemy.run.ts", undefined, "./convex", "ideal-dolphin-15convex"],
    ["apps/x/alchemy.run.ts", undefined, { path: "./convex" }, "ideal-dolphin-15apps/x/convex"],
    ["alchemy.run.ts", undefined, ".", "ideal-dolphin-15."],
    ["apps/x/alchemy.run.ts", undefined, "../../convex/", "ideal-dolphin-15convex"],
    ["alchemy.run.ts", undefined, "../convex", "ideal-dolphin-15"],
    ["alchemy.run.ts", undefined, undefined, "ideal-dolphin-15"],
    ["alchemy.run.ts", "apps/x", "./convex", "ideal-dolphin-15apps/x/convex"],
    ["alchemy.run.ts", ".", "./convex", "ideal-dolphin-15convex"],
    ["apps/x/alchemy.run.ts", "../y", "./convex", "ideal-dolphin-15apps/y/convex"],
    ["alchemy.run.ts", "/abs", "./convex", "ideal-dolphin-15"],
  ])(
    "derives the code location from %s, rootDir %j, and source %j",
    (stackFile, rootDir, source, convex) => {
      const details = stageDetails(renderTree(prodWithSource(stackFile, rootDir, source)))[0] ?? [];

      expect(details[details.indexOf("Convex") + 1]).toBe(convex);
    },
  );

  it("shows a run record of an unknown version", () => {
    const container = renderTree(
      oneStack("samebase/base-alchemy", [
        { name: prod.stage, run: { state: "unknown" }, resources: [], output: null },
      ]),
    );

    expect(stageDetails(container)).toEqual([["Run", "Unknown run record"]]);
  });

  it("links each Cloudflare Worker to its URL", () => {
    // The `main` Worker row, verbatim, from section 4 of
    // research/2026-10-21-alchemy-state-rows-for-workers-and-convex.md (alchemy 2.0.0-beta.83).
    const container = renderTree(
      oneStack("samebase/tmp-k7m2-rows", [
        {
          name: "main",
          run: { state: "none" },
          resources: [
            {
              fqn: "Worker",
              value:
                '{"status":"created","fqn":"Worker","logicalId":"Worker","instanceId":"4fb5acd8a74d8a46633a8e57084e0bc1","resourceType":"Cloudflare.Worker","props":{"name":"tmp-k7m2-rows","main":"./worker.ts","env":{"CONVEX_URL":"https://modest-guanaco-252.convex.cloud"},"isExternal":true},"attr":{"workerId":"6d2434039c4343a9a02300ba85841b70","workerName":"tmp-k7m2-rows","logpush":false,"url":"https://tmp-k7m2-rows.pfp.workers.dev","urls":["https://tmp-k7m2-rows.pfp.workers.dev"],"tags":["alchemy:stack:samebase/tmp-k7m2-rows","alchemy:stage:main","alchemy:id:Worker"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[],"crons":[],"tailConsumers":[],"hash":{"bundle":"b132832cbda33e15a9cffc4ff168139206ddccf97b0a7c2230801d3710200e85","metadata":"6692e8262512d066c344158cd4e091a1287954eb8b43208b87b336715b99bb65"}},"bindings":[{"sid":"CONVEX_URL","data":{"bindings":[{"type":"plain_text","name":"CONVEX_URL","text":"https://modest-guanaco-252.convex.cloud"}]}}],"providerVersion":0,"downstream":[],"removalPolicy":"destroy","providerMode":"live"}',
            },
          ],
          output: null,
        },
      ]),
    );

    expect(stageDetails(container)[0]?.slice(2, 4)).toEqual(["Workers", "tmp-k7m2-rows"]);
    expect(container.querySelector("details > dl a")?.getAttribute("href")).toBe(
      "https://tmp-k7m2-rows.pfp.workers.dev",
    );
  });

  it("shows only the key of a secret in the output", () => {
    // The action already replaces secret values with null, and the view must still hide a value that reaches it.
    const container = renderTree(
      oneStack("samebase/base-alchemy", [
        {
          name: "prod",
          run: { state: "none" },
          resources: [],
          output:
            '{"url":"https://ideal-dolphin-15.convex.site","deployKey":{"__redacted__":"prod:ideal-dolphin-15|state-secret-value"},"nested":{"token":{"__redacted__":null}}}',
        },
      ]),
    );

    expect(container.innerHTML).not.toContain("state-secret-value");
    expect(container.innerHTML).not.toContain("__redacted__");
    expect(
      Array.from(container.querySelectorAll("dl > dd:last-child > div"), (entry) => {
        return Array.from(entry.children, (part) => part.textContent);
      }),
    ).toEqual([["url", "https://ideal-dolphin-15.convex.site"], ["deployKey"], ["nested.token"]]);
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
