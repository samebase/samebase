import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultBranchLinkContent } from "./VaultDashboard";

describe("VaultBranchLinkContent", () => {
  it("links the visible branch label to the GitHub branch tree", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="noter-md/noter"
          branch={{
            name: "codex/dashboard branch-link",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            isDefault: false,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(
      'href="https://github.com/noter-md/noter/tree/codex/dashboard%20branch-link"',
    );
    expect(markup).toContain('title="Open branch on GitHub"');
  });
});
