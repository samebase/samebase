import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { WorkspaceLayoutV3FullPage } from "@/components/workspace-layout-v3/WorkspaceLayoutV3FullPage";
import { WorkspaceLayoutV3MemorySidebarProvider } from "@/components/workspace-layout-v3/WorkspaceLayoutV3MemorySidebarProvider";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import mobileSidebarSpecRaw from "../../../../specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md?raw";
export type WorkspaceLayoutV3VisualMode = "workspace-layout-v3";

const FIXTURE_VAULT_KEY = "workspace-layout-v3-fixture-vault";

/**
 * Mounts the copied v3 layout directly, bypassing AppWorkspaceShell: the
 * production shell hard-mounts v2, and the v3 lab must stay independent of it.
 * Memory-backed sidebar state means fixture state resets on reload.
 */
export function WorkspaceLayoutV3VisualFixture() {
  return (
    <WorkspaceLayoutV3MemorySidebarProvider
      initialState={{
        leftDesktopOpen: true,
        leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        leftMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        mobilePane: "main",
        mobileSurface: { kind: "unmerged" },
        rightDesktopOpen: true,
        rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }}
    >
      <WorkspaceLayoutV3FullPage
        addressChrome={<div data-testid="workspace-layout-v3-address-chrome">/v3-lab</div>}
        dataTestId="workspace-layout-v3-visual-fixture"
        left={{
          content: (
            <CodeMirrorFileSurface
              dataTestId="workspace-layout-v3-prosemark-surface"
              filePath="workspace-layout-v3-left-pane.md"
              initialValue={mobileSidebarSpecRaw}
            />
          ),
        }}
        leftToggleVisibility="all"
        main={{
          content: (
            <MonacoEditorSurface
              branch="main"
              dataTestId="workspace-layout-v3-main-editor-surface"
              defaultValue={mobileSidebarSpecRaw}
              filePath="specs/workspace-layout-v3-main-pane.md"
              onMount={() => {}}
              showMobileLineNumbers={false}
              syncError={null}
              vaultKey={FIXTURE_VAULT_KEY}
            />
          ),
        }}
        right={{
          content: (
            <MonacoEditorSurface
              branch="main"
              dataTestId="workspace-layout-v3-right-editor-surface"
              defaultValue={mobileSidebarSpecRaw}
              filePath="specs/workspace-layout-v3-right-pane.md"
              onMount={() => {}}
              showMobileLineNumbers={false}
              syncError={null}
              vaultKey={FIXTURE_VAULT_KEY}
            />
          ),
        }}
        rightToggleVisibility="all"
      />
    </WorkspaceLayoutV3MemorySidebarProvider>
  );
}
