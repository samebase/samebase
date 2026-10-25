import { parse } from "convex-helpers/validators";
import { describe, expect, it } from "vite-plus/test";
import { observedAlchemyStackReply } from "../convex/repository/fixtures/observedAlchemyState";
import {
  observedSamebaseRepositoryReply,
  observedSamebaseStackReply,
} from "../convex/repository/fixtures/observedSamebaseAlchemyState";
import { groupResourcesByComponent, stackCards } from "./alchemyState";
import { vAlchemyStacksRead, type AlchemyStack } from "./alchemyStateModel";

const [, , prod] = observedAlchemyStackReply.value.stages;
const [deploymentRow, projectRow] = prod.resources;

const [, , samebaseProd] = observedSamebaseStackReply.value.stages;
const [, proxyRow, , siteRow] = samebaseProd.resources;

/**
The captured Project row as `fqn`, with `namespace` as alchemy 2.0.0-beta.83 writes it: the last key,
and absent at the stack root. The namespace values have the shape that an in-memory deploy of
`Namespace.push("Mail", ...)` and `Namespace.push("Mail/Shared", Namespace.push("Inbox", ...))`
wrote.
*/
function projectAt(fqn: string, namespace: string | null) {
  const state: unknown = JSON.parse(
    namespace === null
      ? projectRow.value
      : projectRow.value.replace(/}$/, `,"namespace":${namespace}}`),
  );
  return { fqn, state };
}

describe("groupResourcesByComponent", () => {
  it("groups resources by the namespace of their rows, the most specific binding first", () => {
    // The captured prod Deployment row with the rootDir that 0.8.0 writes and two bindings in the
    // shape of https://github.com/samebase/alchemy-convex/blob/v0.10.0/test/Component.test.ts#L73-L77.
    const deployment: unknown = JSON.parse(
      deploymentRow.value
        .replace('"type":"prod"', '"type":"prod","rootDir":"."')
        .replace(
          '"bindings":[]',
          '"bindings":[{"sid":"convex.component:[\\"Mail\\"]","data":{"type":"component","path":"mail","namespace":["Mail"]}},{"sid":"convex.component:[\\"Mail\\",\\"Archive\\"]","data":{"type":"component","path":"archive","namespace":["Mail","Archive"]}}]',
        ),
    );

    const { others, components } = groupResourcesByComponent([
      { fqn: "Deployment", state: deployment },
      projectAt("Mail/Archive/Bucket", '{"Id":"Archive","Parent":{"Id":"Mail"}}'),
      projectAt("Mail/Loose", null),
      projectAt("Mail/Shared/Inbox/Bucket", '{"Id":"Inbox","Parent":{"Id":"Mail/Shared"}}'),
      projectAt("Mail/Worker", '{"Id":"Mail"}'),
    ]);

    expect(others.map(({ fqn }) => fqn)).toEqual([
      "Deployment",
      "Mail/Loose",
      "Mail/Shared/Inbox/Bucket",
    ]);
    expect(
      components.map(({ path, deployment, resources }) => [
        path,
        deployment.fqn,
        resources.map(({ fqn }) => fqn),
      ]),
    ).toEqual([
      ["archive", "Deployment", ["Mail/Archive/Bucket"]],
      ["mail", "Deployment", ["Mail/Worker"]],
    ]);
  });
});

/** The captured stages of samebase/samebase as `reader:repository` returns them. */
function readerStage(name: string) {
  const read = parse(vAlchemyStacksRead, observedSamebaseRepositoryReply);
  const stage =
    read.store === "found"
      ? read.stacks.flatMap((stack) => stack.stages).find((candidate) => candidate.name === name)
      : undefined;
  if (!stage) {
    throw new Error(`Expected the captured stage ${name}.`);
  }
  return stage;
}

/** A stack `name` whose stage `prod` is the captured one from `stackFile` with `resources`. */
function prodStack(
  name: string,
  stackFile: string,
  resources: readonly { fqn: string; value: string }[],
): AlchemyStack {
  const stage = readerStage("prod");
  return {
    name,
    stages: [{ ...stage, record: { ...stage.record, stackFile }, resources: [...resources] }],
  };
}

/** The captured Site row with the `rootDir` that @samebase/alchemy-convex 0.8.0 writes. */
const site = {
  fqn: "Site",
  value: siteRow.value.replace('"type":"prod"', '"type":"prod","rootDir":"."'),
};
/** The captured PosthogProxy row: its zone route gives it no URL. */
const proxy = { fqn: "PosthogProxy", value: proxyRow.value };
/** The captured PosthogProxy row with a workers.dev URL. */
const proxyWithUrl = {
  fqn: "Proxy",
  value: proxyRow.value.replace(
    '"urls":[]',
    '"url":"https://samebase-posthog-proxy.samebase.workers.dev","urls":["https://samebase-posthog-proxy.samebase.workers.dev"]',
  ),
};

type LiveDeployment = Parameters<typeof stackCards>[0]["liveDeployments"][number];

/** The address of the one card of a root stack with `resources`. */
function addressOf(
  liveDeployments: LiveDeployment[],
  resources: readonly { fqn: string; value: string }[],
) {
  return stackCards({
    stage: "prod",
    headCommit: null,
    liveDeployments,
    stacks: [prodStack("samebase/samebase", "alchemy.run.ts", resources)],
  }).map((card) => card.address);
}

/** The live read of clear-butterfly-858 with `customDomains`. */
function liveSite(customDomains: LiveDeployment["customDomains"]): LiveDeployment[] {
  return [
    { deploymentName: "clear-butterfly-858", dashboardUrl: null, region: null, customDomains },
  ];
}

/** The live read gives the recorded reply of `observedConvexCustomDomains.ts` oldest first. */
const siteAndCloudDomains: LiveDeployment["customDomains"] = [
  { domain: "api.samebase.com", requestDestination: "convexSite" },
  { domain: "cloud.samebase.com", requestDestination: "convexCloud" },
  { domain: "samebase.com", requestDestination: "convexSite" },
];

describe("stackCards", () => {
  it("makes one card for each stack with a stage prod, in stack file order", () => {
    const cards = stackCards({
      stage: "prod",
      headCommit: null,
      liveDeployments: [],
      stacks: [
        prodStack("samebase/samebase", "infra/alchemy.run.ts", [site]),
        { name: "samebase/samebase/apps/preview", stages: [readerStage("pr-1768")] },
        prodStack(
          "samebase/samebase/apps/sidebars-example",
          "apps/sidebars-example/alchemy.run.ts",
          [proxy],
        ),
      ],
    });

    expect(cards.map(({ stack, stackFile, folder }) => [stack, stackFile, folder])).toEqual([
      [
        "samebase/samebase/apps/sidebars-example",
        "apps/sidebars-example/alchemy.run.ts",
        "apps/sidebars-example",
      ],
      ["samebase/samebase", "infra/alchemy.run.ts", "infra"],
    ]);
  });

  it("frames the cards and names the root folder only when the repository has several stacks", () => {
    const framing = (stacks: Parameters<typeof stackCards>[0]["stacks"]) =>
      stackCards({ stage: "prod", headCommit: null, liveDeployments: [], stacks }).map(
        ({ framed, folder }) => ({ framed, folder }),
      );

    // The only stack, at the root: no frame and no folder.
    expect(framing([prodStack("samebase/base-alchemy", "alchemy.run.ts", [site])])).toEqual([
      { framed: false, folder: null },
    ]);
    // The only stack, in a folder: no frame, and the folder says where the app lives.
    expect(
      framing([
        prodStack("samebase/convex-cloudflare-email-inbox", "apps/mail/alchemy.run.ts", [site]),
      ]),
    ).toEqual([{ framed: false, folder: "apps/mail" }]);
    // Two stacks: both cards are framed, and the root stack names its folder.
    expect(
      framing([
        prodStack("samebase/samebase", "alchemy.run.ts", [site]),
        prodStack(
          "samebase/samebase/apps/sidebars-example",
          "apps/sidebars-example/alchemy.run.ts",
          [proxy],
        ),
      ]),
    ).toEqual([
      { framed: true, folder: "/" },
      { framed: true, folder: "apps/sidebars-example" },
    ]);
  });

  it("makes the cards of a pull request from the stacks with its stage, at the preview site", () => {
    // The captured `pr-1768` and `prod` stages of samebase/samebase, and a stack with only `prod`.
    const cards = stackCards({
      stage: "pr-1768",
      headCommit: "429c1218a16d2ee74b9da68d684dc460a0a67ce8",
      liveDeployments: [],
      stacks: [
        { name: "samebase/samebase", stages: [readerStage("pr-1768"), readerStage("prod")] },
        prodStack(
          "samebase/samebase/apps/sidebars-example",
          "apps/sidebars-example/alchemy.run.ts",
          [proxyWithUrl],
        ),
      ],
    });

    expect(
      cards.map(({ resources, ...card }) => ({
        ...card,
        deployments: resources.convexDeployments.map(({ state }) => state.attr.name),
      })),
    ).toEqual([
      {
        stack: "samebase/samebase",
        stackFile: "alchemy.run.ts",
        // The repository has two stacks, so the card is framed and names its folder as on the
        // default branch.
        framed: true,
        folder: "/",
        // The stage deployed the head of the pull request.
        run: null,
        address: "https://aware-bobcat-542.convex.site",
        addressWorker: null,
        deployments: ["aware-bobcat-542"],
      },
    ]);
  });

  it("names no folder only for the one card of a stack file at the root", () => {
    const foldersOf = (stackFiles: readonly string[]) =>
      stackCards({
        stage: "prod",
        headCommit: null,
        liveDeployments: [],
        stacks: stackFiles.map((stackFile) => prodStack(stackFile, stackFile, [proxy])),
      }).map((card) => card.folder);

    expect(foldersOf(["alchemy.run.ts"])).toEqual([null]);
    expect(foldersOf(["infra/alchemy.run.ts"])).toEqual(["infra"]);
    expect(foldersOf(["alchemy.run.ts", "apps/sidebars-example/alchemy.run.ts"])).toEqual([
      "/",
      "apps/sidebars-example",
    ]);
  });

  it("shows the run line only when the deployed commit differs from the head above the cards", () => {
    // The captured stage `prod` of samebase/samebase, which deployed 1592243.
    const deployed = "1592243a49970f5c5142009b7ca7b2d71d31f104";
    const runsOf = (headCommit: string | null, deployedHeadCommit: string | null) =>
      stackCards({
        stage: "prod",
        headCommit,
        liveDeployments: [],
        stacks: [
          { name: "samebase/samebase", stages: [{ ...readerStage("prod"), deployedHeadCommit }] },
        ],
      }).map((card) => card.run);

    expect(runsOf(deployed, deployed)).toEqual([null]);
    expect(runsOf("81145b7d2a32186823452c7515b2d5ba2d79b350", deployed)).toEqual([
      {
        deployedHeadCommit: deployed,
        recordedAt: "2026-10-22T08:22:58.152Z",
        runUrl: "https://github.com/samebase/samebase/actions/runs/39746887572/attempts/1",
      },
    ]);
    // The GitHub read has not given the head yet.
    expect(runsOf(null, deployed)).toEqual([null]);
    // The first deploy of the stage has not completed.
    expect(runsOf(deployed, null)).toEqual([null]);
  });

  it("serves a stack at the site custom domain of its first Convex deployment, else at its site URL", () => {
    expect(addressOf(liveSite(siteAndCloudDomains), [site, proxyWithUrl])).toEqual([
      "https://samebase.com",
    ]);
    // The site domain with the fewest labels wins over the older api.samebase.com, and the
    // oldest wins a tie.
    expect(
      addressOf(
        liveSite([
          { domain: "samebase.dev", requestDestination: "convexSite" },
          { domain: "samebase.app", requestDestination: "convexSite" },
        ]),
        [site],
      ),
    ).toEqual(["https://samebase.dev"]);
    // A `convexCloud` domain serves the client API, not the site.
    expect(addressOf(liveSite([siteAndCloudDomains[1]]), [site])).toEqual([
      "https://clear-butterfly-858.convex.site",
    ]);
    // Convex refused the custom domains, or the live read failed.
    expect(addressOf(liveSite([]), [site])).toEqual(["https://clear-butterfly-858.convex.site"]);
    expect(addressOf([], [site])).toEqual(["https://clear-butterfly-858.convex.site"]);
    // The first deployment by fqn decides.
    expect(
      addressOf(liveSite(siteAndCloudDomains), [
        { fqn: "Api", value: site.value.replaceAll("clear-butterfly-858", "happy-otter-123") },
        site,
      ]),
    ).toEqual(["https://happy-otter-123.convex.site"]);
  });

  it("names the Worker whose URL is the address, so that its row does not repeat it", () => {
    const addressWorkerOf = (resources: readonly { fqn: string; value: string }[]) =>
      stackCards({
        stage: "prod",
        headCommit: null,
        liveDeployments: [],
        stacks: [prodStack("samebase/samebase", "alchemy.run.ts", resources)],
      }).map((card) => card.addressWorker);

    expect(addressWorkerOf([proxy, proxyWithUrl])).toEqual(["Proxy"]);
    // A site URL or no address comes from no Worker.
    expect(addressWorkerOf([proxyWithUrl, site])).toEqual([null]);
    expect(addressWorkerOf([proxy])).toEqual([null]);
  });

  it("serves a stack without a Convex deployment at its first Worker URL, else at none", () => {
    expect(addressOf([], [proxy, proxyWithUrl])).toEqual([
      "https://samebase-posthog-proxy.samebase.workers.dev",
    ]);
    expect(addressOf([], [proxy])).toEqual([null]);
  });
});
