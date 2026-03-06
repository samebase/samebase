import { describe, expect, it } from "vitest";

import {
  getRepositoryMediaKind,
  isRenderableRepositoryMediaPath,
  isSvgRepositoryMediaPath,
} from "../../shared/repositoryMedia";

describe("repositoryMedia", () => {
  it("recognizes supported image extensions from the file name", () => {
    expect(getRepositoryMediaKind("assets/icons/logo.SVG")).toBe("image");
    expect(isRenderableRepositoryMediaPath("assets/lumina_icon.png")).toBe(
      true,
    );
  });

  it("ignores dotted directories when the file name has no extension", () => {
    expect(getRepositoryMediaKind("folder.config/imagefile")).toBeNull();
    expect(isSvgRepositoryMediaPath("folder.config/imagefile")).toBe(false);
  });

  it("treats hidden files without an extension as non-media", () => {
    expect(getRepositoryMediaKind(".env")).toBeNull();
    expect(isRenderableRepositoryMediaPath(".env")).toBe(false);
  });
});
