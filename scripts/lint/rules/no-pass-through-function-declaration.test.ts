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

function returnedCall(callArguments: TestCallArgument[], awaitCall: boolean) {
  const call = {
    type: "CallExpression",
    callee: identifier("target"),
    arguments: callArguments,
  } as const;

  return awaitCall ? ({ type: "AwaitExpression", argument: call } as const) : call;
}

function blockBody(callArguments: TestCallArgument[], awaitCall: boolean, extraStatement: boolean) {
  const returned = {
    type: "ReturnStatement",
    argument: returnedCall(callArguments, awaitCall),
  } as const;

  return {
    type: "BlockStatement",
    body: extraStatement ? [{ type: "ExpressionStatement" }, returned] : [returned],
  } as const;
}

function functionDeclaration({
  arguments: callArguments,
  awaitCall = false,
  extraStatement = false,
  name = "wrapper",
  parameters,
}: {
  arguments: TestCallArgument[];
  awaitCall?: boolean;
  extraStatement?: boolean;
  name?: string;
  parameters: TestParameter[];
}) {
  return {
    type: "FunctionDeclaration",
    id: identifier(name),
    params: parameters,
    body: blockBody(callArguments, awaitCall, extraStatement),
  } as const;
}

function functionBinding({
  arguments: callArguments,
  awaitCall = false,
  declarationKind = "const",
  expressionBody = false,
  extraStatement = false,
  functionKind,
  name = "wrapper",
  parameters,
}: {
  arguments: TestCallArgument[];
  awaitCall?: boolean;
  declarationKind?: "const" | "let";
  expressionBody?: boolean;
  extraStatement?: boolean;
  functionKind: "arrow" | "expression";
  name?: string;
  parameters: TestParameter[];
}) {
  const body = expressionBody
    ? returnedCall(callArguments, awaitCall)
    : blockBody(callArguments, awaitCall, extraStatement);
  const init =
    functionKind === "arrow"
      ? ({ type: "ArrowFunctionExpression", params: parameters, body } as const)
      : ({ type: "FunctionExpression", params: parameters, body } as const);

  return {
    type: "VariableDeclaration",
    kind: declarationKind,
    declarations: [{ type: "VariableDeclarator", id: identifier(name), init }],
  } as const;
}

type TestNode = ReturnType<typeof functionDeclaration> | ReturnType<typeof functionBinding>;

function markExported<Node extends TestNode>(node: Node): Node {
  Object.defineProperty(node, "parent", {
    value: { type: "ExportNamedDeclaration", declaration: node, specifiers: [], source: null },
  });

  return node;
}

function findReports(node: TestNode) {
  const reports: Array<{ messageId: string }> = [];
  const visitors = noPassThroughFunctionDeclaration.create({
    report(report: { messageId: string }) {
      reports.push(report);
    },
  });

  if (node.type === "FunctionDeclaration") {
    visitors.FunctionDeclaration(node);
  } else {
    visitors.VariableDeclaration(node);
  }

  return reports;
}

describe("no-pass-through-function-declaration", () => {
  const parameters = [identifier("ctx"), identifier("args")];
  const callArguments = [identifier("ctx"), identifier("args")];

  it("reports direct and awaited function declarations", () => {
    expect(findReports(functionDeclaration({ parameters, arguments: callArguments }))).toHaveLength(
      1,
    );
    expect(
      findReports(functionDeclaration({ parameters, arguments: callArguments, awaitCall: true })),
    ).toHaveLength(1);
  });

  it("reports direct and awaited const arrow functions", () => {
    expect(
      findReports(
        functionBinding({
          functionKind: "arrow",
          parameters,
          arguments: callArguments,
          expressionBody: true,
        }),
      ),
    ).toHaveLength(1);
    expect(
      findReports(
        functionBinding({
          functionKind: "arrow",
          parameters,
          arguments: callArguments,
          awaitCall: true,
        }),
      ),
    ).toHaveLength(1);
  });

  it("reports direct and awaited const function expressions", () => {
    expect(
      findReports(
        functionBinding({
          functionKind: "expression",
          parameters,
          arguments: callArguments,
        }),
      ),
    ).toHaveLength(1);
    expect(
      findReports(
        functionBinding({
          functionKind: "expression",
          parameters,
          arguments: callArguments,
          awaitCall: true,
        }),
      ),
    ).toHaveLength(1);
  });

  it("reports exported wrappers", () => {
    const exportedDeclaration = functionDeclaration({
      name: "exportedDeclaration",
      parameters,
      arguments: callArguments,
    });
    const exportedBinding = functionBinding({
      functionKind: "arrow",
      name: "exportedBinding",
      parameters,
      arguments: callArguments,
      expressionBody: true,
    });

    expect(findReports(markExported(exportedDeclaration))).toHaveLength(1);
    expect(findReports(markExported(exportedBinding))).toHaveLength(1);
  });

  it("does not report calls that transform, reorder, omit, or add arguments", () => {
    const variants: TestCallArgument[][] = [
      [identifier("args"), identifier("ctx")],
      [identifier("ctx")],
      [identifier("ctx"), identifier("args"), { type: "Literal", value: "extra" }],
      [{ type: "MemberExpression" }, identifier("args")],
    ];

    for (const variant of variants) {
      expect(findReports(functionDeclaration({ parameters, arguments: variant }))).toEqual([]);
    }
  });

  it("does not report functions with extra statements or non-positional parameters", () => {
    for (const node of [
      functionDeclaration({
        parameters,
        arguments: callArguments,
        extraStatement: true,
      }),
      functionBinding({
        functionKind: "arrow",
        parameters,
        arguments: callArguments,
        extraStatement: true,
      }),
      functionBinding({
        functionKind: "expression",
        parameters,
        arguments: callArguments,
        extraStatement: true,
      }),
    ]) {
      expect(findReports(node)).toEqual([]);
    }

    for (const parameter of [
      { type: "AssignmentPattern" },
      { type: "ObjectPattern" },
      { type: "RestElement" },
    ] satisfies TestParameter[]) {
      expect(
        findReports(
          functionDeclaration({ parameters: [parameter], arguments: [identifier("value")] }),
        ),
      ).toEqual([]);
    }
  });

  it("does not report zero-parameter calls or mutable function bindings", () => {
    expect(findReports(functionDeclaration({ parameters: [], arguments: [] }))).toEqual([]);
    expect(
      findReports(
        functionBinding({
          functionKind: "arrow",
          declarationKind: "let",
          parameters,
          arguments: callArguments,
          expressionBody: true,
        }),
      ),
    ).toEqual([]);
  });

  it("does not visit callbacks or methods", () => {
    const visitors = noPassThroughFunctionDeclaration.create({ report() {} });

    expect(visitors.FunctionExpression).toBeUndefined();
    expect(visitors.ArrowFunctionExpression).toBeUndefined();
    expect(visitors.MethodDefinition).toBeUndefined();
    expect(visitors.Property).toBeUndefined();
  });
});
