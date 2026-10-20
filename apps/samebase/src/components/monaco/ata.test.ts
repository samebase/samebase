import { describe, expect, it, vi } from "vite-plus/test";
import { setupEditorATA } from "./ata";
import { applyTsConfigToMonaco, parseTsConfig } from "./setupEditor";

vi.mock("@typescript/ata", () => ({ setupTypeAcquisition: () => async () => {} }));
vi.mock("typescript", () => ({ default: {} }));

function fakeMonaco() {
  // Monaco's own initial TypeScript compiler options.
  let compilerOptions: object = { allowNonTsExtensions: true, target: 99 };
  return {
    languages: {
      typescript: {
        JsxEmit: { React: 2 },
        typescriptDefaults: {
          addExtraLib: () => {},
          getCompilerOptions: () => compilerOptions,
          setCompilerOptions: (options: object) => {
            compilerOptions = options;
          },
        },
      },
    },
  };
}

const editor = { getValue: () => "", onDidChangeModelContent: () => {} };

describe("setupEditorATA", () => {
  it("keeps the project's tsconfig that the editor applied before type acquisition loaded", () => {
    const monaco = fakeMonaco();
    const tsconfig = {
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] }, strict: false },
    };

    applyTsConfigToMonaco(monaco, parseTsConfig(JSON.stringify(tsconfig)));
    // @ts-expect-error The setup reads only getValue and onDidChangeModelContent of the editor.
    setupEditorATA(editor, monaco);

    expect(monaco.languages.typescript.typescriptDefaults.getCompilerOptions()).toMatchObject({
      baseUrl: "file:///",
      paths: { "@/*": ["src/*"] },
      strict: false,
    });
  });

  it("gives a TypeScript file without a project tsconfig the editor defaults", () => {
    const monaco = fakeMonaco();

    // @ts-expect-error The setup reads only getValue and onDidChangeModelContent of the editor.
    setupEditorATA(editor, monaco);

    expect(monaco.languages.typescript.typescriptDefaults.getCompilerOptions()).toEqual({
      allowNonTsExtensions: true,
      esModuleInterop: true,
      exactOptionalPropertyTypes: true,
      jsx: 2,
      strict: true,
      target: 99,
    });
  });
});
