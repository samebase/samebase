import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error JavaScript lint plugins do not publish TypeScript declarations.
import { noPassThroughFunctionDeclaration } from "./no-pass-through-function-declaration.js";

type TestParameter =
  | { type: "Identifier"; name: string }
  | { type: "AssignmentPattern" }
  | { type: "ObjectPattern" }
  | { type: "RestElement" };

type TestCallArgument =
  | { type: "Identifier"; name: string }
  | { type: "Literal"; value: string }
  | { type: "MemberExpression" }
  | { type: "SpreadElement" };

function identifier(name: string) {
  return { type: "Identifier", name } as const;
}

function functionDeclaration({
  arguments: callArguments,
  awaitCall = false,
  name = "wrapper",
  parameters,
  precedingStatement = false,
}: {
  arguments: TestCallArgument[];
  awaitCall?: boolean;
  name?: string;
  parameters: TestParameter[];
  precedingStatement?: boolean;
}) {
  const call = { type: "CallExpression", arguments: callArguments } as const;
  const returned = {
    type: "ReturnStatement",
    argument: awaitCall ? ({ type: "AwaitExpression", argument: call } as const) : call,
  } as const;

  return {
    type: "FunctionDeclaration",
    id: identifier(name),
    params: parameters,
    body: {
      type: "BlockStatement",
      body: precedingStatement ? [{ type: "ExpressionStatement" }, returned] : [returned],
    },
  };
}

function findReports({
  directExport = false,
  exportedNames = [],
  node,
}: {
  directExport?: boolean;
  exportedNames?: string[];
  node: ReturnType<typeof functionDeclaration>;
}) {
  const reports: Array<{ messageId: string }> = [];
  const visitors = noPassThroughFunctionDeclaration.create({
    report(report: { messageId: string }) {
      reports.push(report);
    },
  });

  visitors.Program({
    type: "Program",
    body: directExport
      ? [
          {
            type: "ExportNamedDeclaration",
            declaration: node,
            source: null,
            specifiers: [],
          },
        ]
      : [
          node,
          ...exportedNames.map((name) => ({
            type: "ExportNamedDeclaration",
            declaration: null,
            source: null,
            specifiers: [
              {
                type: "ExportSpecifier",
                local: identifier(name),
              },
            ],
          })),
        ],
  });
  visitors.FunctionDeclaration(node);

  return reports;
}

describe("no-pass-through-function-declaration", () => {
  it("reports direct and awaited calls that only forward named parameters", () => {
    const parameters = [identifier("ctx"), identifier("args")];
    const callArguments = [identifier("ctx"), identifier("args")];

    expect(
      findReports({ node: functionDeclaration({ parameters, arguments: callArguments }) }),
    ).toHaveLength(1);
    expect(
      findReports({
        node: functionDeclaration({
          parameters,
          arguments: callArguments,
          awaitCall: true,
        }),
      }),
    ).toHaveLength(1);
  });

  it("does not report exported declarations", () => {
    const node = functionDeclaration({
      name: "publicWrapper",
      parameters: [identifier("value")],
      arguments: [identifier("value")],
    });

    expect(findReports({ node, directExport: true })).toEqual([]);
    expect(findReports({ node, exportedNames: ["publicWrapper"] })).toEqual([]);
  });

  it("does not report calls that transform, reorder, omit, or add arguments", () => {
    const parameters = [identifier("first"), identifier("second")];
    const variants: TestCallArgument[][] = [
      [identifier("second"), identifier("first")],
      [identifier("first")],
      [identifier("first"), identifier("second"), { type: "Literal", value: "extra" }],
      [{ type: "MemberExpression" }, identifier("second")],
    ];

    for (const callArguments of variants) {
      expect(
        findReports({ node: functionDeclaration({ parameters, arguments: callArguments }) }),
      ).toEqual([]);
    }
  });

  it("does not report functions with extra statements or non-positional parameters", () => {
    expect(
      findReports({
        node: functionDeclaration({
          parameters: [identifier("value")],
          arguments: [identifier("value")],
          precedingStatement: true,
        }),
      }),
    ).toEqual([]);

    for (const parameter of [
      { type: "AssignmentPattern" },
      { type: "ObjectPattern" },
      { type: "RestElement" },
    ] satisfies TestParameter[]) {
      expect(
        findReports({
          node: functionDeclaration({
            parameters: [parameter],
            arguments: [identifier("value")],
          }),
        }),
      ).toEqual([]);
    }
  });

  it("does not report zero-parameter calls", () => {
    expect(findReports({ node: functionDeclaration({ parameters: [], arguments: [] }) })).toEqual(
      [],
    );
  });

  it("does not visit callbacks, function expressions, arrow functions, or methods", () => {
    const visitors = noPassThroughFunctionDeclaration.create({ report() {} });

    expect(visitors.FunctionExpression).toBeUndefined();
    expect(visitors.ArrowFunctionExpression).toBeUndefined();
    expect(visitors.MethodDefinition).toBeUndefined();
    expect(visitors.Property).toBeUndefined();
  });
});
