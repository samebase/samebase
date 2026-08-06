import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { FileViewVaultUnavailableState } from "./FileView";

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({ children }: { children?: ReactNode }) => children ?? null,
}));

describe("FileViewVaultUnavailableState", () => {
  it("shows a safe return link without repository data", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/lost/private/main/secret.txt"]}>
        <FileViewVaultUnavailableState />
      </TestRouterProvider>,
    );

    expect(markup).toContain("Vault unavailable");
    expect(markup).toContain("All vaults");
    expect(markup).toContain('href="/vault"');
    expect(markup).not.toContain("lost/private");
    expect(markup).not.toContain("secret.txt");
  });
});
