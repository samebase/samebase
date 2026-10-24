import { describe, expect, it } from "vite-plus/test";
import { observedAlchemyStackReply } from "../convex/repository/fixtures/observedAlchemyState";
import { observedSamebaseStackReply } from "../convex/repository/fixtures/observedSamebaseAlchemyState";
import { groupResourcesByComponent, placeStageResources } from "./alchemyState";

const [, , prod] = observedAlchemyStackReply.value.stages;
const [deploymentRow, projectRow] = prod.resources;

const [, , samebaseProd] = observedSamebaseStackReply.value.stages;
const [, proxyRow, , siteRow] = samebaseProd.resources;

/**
The directories of the Workers of a stage of `stackFile`: the captured Site row with each `rootDir`,
and the captured PosthogProxy row with each `main`, or without `main` for null.
*/
function placeWorkers(
  stackFile: string,
  rootDirs: readonly string[],
  mains: readonly (string | null)[],
) {
  const { workers } = placeStageResources({
    stackFile,
    resources: [
      ...rootDirs.map((rootDir, index) => ({
        fqn: `Site${index}`,
        value: siteRow.value.replace('"type":"prod"', `"type":"prod","rootDir":"${rootDir}"`),
      })),
      ...mains.map((main, index) => ({
        fqn: `PosthogProxy${index}`,
        value: proxyRow.value.replace(
          '"main":"../posthog-proxy/src/index.ts",',
          main === null ? "" : `"main":"${main}",`,
        ),
      })),
    ],
  });
  return workers.map(({ rootDirectory }) => rootDirectory);
}

describe("placeStageResources", () => {
  it("places a Worker in the app directory that holds its main, by whole path segments", () => {
    expect(
      placeWorkers(
        "alchemy.run.ts",
        ["apps/samebase"],
        [
          "apps/samebase/workers/posthog-proxy/index.ts",
          "apps/other/src/index.ts",
          "apps/samebase-tools/x.ts",
        ],
      ),
    ).toEqual(["apps/samebase", "/", "/"]);
  });

  it("resolves main against the stack directory and takes the deepest app directory", () => {
    expect(
      placeWorkers(
        "infra/alchemy.run.ts",
        ["../apps", "../apps/samebase"],
        [
          "../apps/samebase/workers/posthog-proxy/index.ts",
          "../apps/other/src/index.ts",
          "./worker.ts",
          "../../outside.ts",
          null,
        ],
      ),
    ).toEqual(["apps/samebase", "apps", "infra", "infra", "infra"]);
  });
});

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
