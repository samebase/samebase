// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { fileViewModuleLoadCount } = vi.hoisted(() => ({
  fileViewModuleLoadCount: { current: 0 },
}));

describe("vault file route", () => {
  afterEach(() => {
    fileViewModuleLoadCount.current = 0;
    vi.resetModules();
    vi.doUnmock("#src/components/FileView/FileView.tsx");
  });

  it("does not load FileView when the vault route component preloads", async () => {
    vi.doMock("#src/components/FileView/FileView.tsx", () => {
      fileViewModuleLoadCount.current += 1;

      return {
        FileView: () => <div data-testid="file-view-page">File view page</div>,
      };
    });

    const { Route } = await import("./vault-file");
    expect(fileViewModuleLoadCount.current).toBe(0);

    const routeComponent = Route.options.component;
    if (!routeComponent) {
      throw new Error("vault file route component is missing");
    }

    const preload = "preload" in routeComponent ? routeComponent.preload : null;
    if (preload) {
      await preload();
    }

    expect(fileViewModuleLoadCount.current).toBe(0);
  });
});
