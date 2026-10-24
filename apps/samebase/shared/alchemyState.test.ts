import { describe, expect, it } from "vite-plus/test";
import { observedAlchemyStackReply } from "../convex/repository/fixtures/observedAlchemyState";
import { groupResourcesByComponent } from "./alchemyState";

const [, , prod] = observedAlchemyStackReply.value.stages;
const [deploymentRow, projectRow] = prod.resources;

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
      components.map(({ path, resources }) => [path, resources.map(({ fqn }) => fqn)]),
    ).toEqual([
      ["archive", ["Mail/Archive/Bucket"]],
      ["mail", ["Mail/Worker"]],
    ]);
  });
});
