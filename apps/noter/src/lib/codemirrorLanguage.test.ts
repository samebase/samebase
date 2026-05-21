import { describe, expect, it } from "vite-plus/test";
import {
  getCodeMirrorFileLanguageKind,
  loadCodeMirrorLanguageExtension,
} from "@/lib/codemirrorLanguage";

describe("codemirrorLanguage", () => {
  it("keeps markdown files on the markdown parser path", () => {
    expect(getCodeMirrorFileLanguageKind("README.md")).toBe("markdown");
    expect(getCodeMirrorFileLanguageKind("rfcs/spec.mdx")).toBe("markdown");
    expect(getCodeMirrorFileLanguageKind("README")).toBe("markdown");
  });

  it("resolves known code files to language-aware mode", async () => {
    expect(getCodeMirrorFileLanguageKind("src/file.tsx")).toBe("code");
    expect(getCodeMirrorFileLanguageKind("src/Component.TSX")).toBe("code");
    expect(getCodeMirrorFileLanguageKind("infra/Dockerfile")).toBe("code");
    expect(getCodeMirrorFileLanguageKind("Dockerfile")).toBe("code");

    const extension = await loadCodeMirrorLanguageExtension("src/file.tsx");
    expect(Array.isArray(extension)).toBe(true);
    expect(extension).not.toHaveLength(0);

    await expect(loadCodeMirrorLanguageExtension("infra/Dockerfile")).resolves.not.toEqual([]);
  });

  it("falls back to plain text when no file language matches", async () => {
    expect(getCodeMirrorFileLanguageKind("notes.txt")).toBe("plain");
    await expect(loadCodeMirrorLanguageExtension("notes.txt")).resolves.toEqual([]);
  });
});
