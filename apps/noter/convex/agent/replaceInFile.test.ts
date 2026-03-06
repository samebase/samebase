import { describe, expect, it } from "vitest";
import { buildReplaceInFilePlan, ReplaceInFileError } from "./replaceInFile";

describe("buildReplaceInFilePlan", () => {
  it("builds a minimal change set for multiple exact replacements", () => {
    const plan = buildReplaceInFilePlan({
      sourceContent: [
        "export function greet() {",
        "  const adjective = 'friendly';",
        "  return adjective;",
        "}",
        "",
      ].join("\n"),
      replacements: [
        {
          oldText: "friendly",
          newText: "curious",
        },
        {
          oldText: "return adjective;",
          newText: "return adjective.toUpperCase();",
        },
      ],
    });

    expect(plan.finalContent).toContain("const adjective = 'curious';");
    expect(plan.finalContent).toContain("return adjective.toUpperCase();");
    expect(plan.resolvedEdits).toEqual([
      {
        replacementIndex: 1,
        startLine: 2,
        startCharacter: 21,
        endLine: 2,
        endCharacter: 29,
      },
      {
        replacementIndex: 2,
        startLine: 3,
        startCharacter: 2,
        endLine: 3,
        endCharacter: 19,
      },
    ]);
    expect(plan.serializedChangeSet).toContain("[");
  });

  it("matches CRLF files when snippets are supplied with LF", () => {
    const plan = buildReplaceInFilePlan({
      sourceContent: "const count = 0;\r\nreturn count;\r\n",
      replacements: [
        {
          oldText: "const count = 0;\n",
          newText: "const count = 1;\n",
        },
      ],
    });

    expect(plan.finalContent.replace(/\r\n?/g, "\n")).toBe(
      "const count = 1;\nreturn count;\n",
    );
  });

  it("fails when a replacement matches multiple locations", () => {
    expect(() =>
      buildReplaceInFilePlan({
        sourceContent: "flag && flag\n",
        replacements: [
          {
            oldText: "flag",
            newText: "enabled",
          },
        ],
      }),
    ).toThrowError(
      new ReplaceInFileError(
        "replace_in_file failed: replacement 1 matched multiple locations; include more surrounding context",
      ),
    );
  });

  it("fails when replacements are empty", () => {
    expect(() =>
      buildReplaceInFilePlan({
        sourceContent: "const value = 1;\n",
        replacements: [],
      }),
    ).toThrowError(
      new ReplaceInFileError(
        "replace_in_file failed: replacements must not be empty",
      ),
    );
  });

  it("fails when oldText is empty", () => {
    expect(() =>
      buildReplaceInFilePlan({
        sourceContent: "const value = 1;\n",
        replacements: [
          {
            oldText: "",
            newText: "const value = 2;",
          },
        ],
      }),
    ).toThrowError(
      new ReplaceInFileError(
        "replace_in_file failed: replacement 1 has empty oldText",
      ),
    );
  });

  it("fails when a replacement does not match any text", () => {
    expect(() =>
      buildReplaceInFilePlan({
        sourceContent: "const value = 1;\n",
        replacements: [
          {
            oldText: "const missing = 1;",
            newText: "const missing = 2;",
          },
        ],
      }),
    ).toThrowError(
      new ReplaceInFileError(
        "replace_in_file failed: replacement 1 did not match any text",
      ),
    );
  });

  it("fails when replacements overlap", () => {
    expect(() =>
      buildReplaceInFilePlan({
        sourceContent: "const result = computeValue();\n",
        replacements: [
          {
            oldText: "result = computeValue",
            newText: "value = computeValue",
          },
          {
            oldText: "computeValue()",
            newText: "buildValue()",
          },
        ],
      }),
    ).toThrowError(
      new ReplaceInFileError(
        "replace_in_file failed: replacements 1 and 2 overlap",
      ),
    );
  });
});
