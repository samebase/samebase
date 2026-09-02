import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createMemoryHistory } from "@tanstack/react-router";
import { createAppRouter } from "@/router";

const { fileViewModuleLoadCount } = vi.hoisted(() => ({
  fileViewModuleLoadCount: { current: 0 },
}));

describe("repository file route", () => {
  afterEach(() => {
    fileViewModuleLoadCount.current = 0;
    vi.resetModules();
    vi.doUnmock("@/components/FileView/FileView");
  });

  it("does not load FileView when the repository route component preloads", async () => {
    vi.doMock("@/components/FileView/FileView", () => {
      fileViewModuleLoadCount.current += 1;

      return {
        FileView: () => <div data-testid="file-view-page">File view page</div>,
      };
    });

    const { Route } = await import("./vault-file");
    expect(fileViewModuleLoadCount.current).toBe(0);

    const routeComponent = Route.options.component;
    if (!routeComponent) {
      throw new Error("repository file route component is missing");
    }

    const preload = "preload" in routeComponent ? routeComponent.preload : null;
    if (preload) {
      await preload();
    }

    expect(fileViewModuleLoadCount.current).toBe(0);
  });

  it("matches the shipped FileView path", async () => {
    const router = createAppRouter(
      createMemoryHistory({
        initialEntries: ["/repo/samebase/samebase/fs/main/README.md"],
      }),
    );

    await router.load({ sync: true });

    expect(router.state.matches.map((match) => match.routeId)).toContain("/repo/$");
  });
});
