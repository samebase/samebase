import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { AppPageFrame } from "@/components/AppPageFrame";
import { SidebarProvider } from "@/components/sidebar";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import mobileSidebarSpecRaw from "../../../../specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md?raw";
export type WorkspaceLayoutV2VisualMode = "workspace-layout-v2-status-bar";

const FIXTURE_VAULT_KEY = "workspace-layout-v2-fixture-vault";
const FIXTURE_SIDEBAR_WIDTH_PX = 320;

export function WorkspaceLayoutV2VisualFixture() {
  return (
    <AppPageFrame dataTestId="workspace-layout-v2-visual-fixture">
      <SidebarProvider
        className="flex-1 h-full min-h-0"
        defaultOpen={true}
        defaultLeftDesktopWidthPx={FIXTURE_SIDEBAR_WIDTH_PX}
        defaultLeftMobileWidthPx={FIXTURE_SIDEBAR_WIDTH_PX}
        defaultRightOpen={true}
        defaultRightDesktopWidthPx={FIXTURE_SIDEBAR_WIDTH_PX}
        defaultRightMobileWidthPx={FIXTURE_SIDEBAR_WIDTH_PX}
      >
        <WorkspaceLayoutV2FullPage
          left={{
            headerTestId: "workspace-layout-v2-left-pane-header",
            content: (
              <CodeMirrorFileSurface
                dataTestId="workspace-layout-v2-prosemark-surface"
                filePath="workspace-layout-v2-left-pane.md"
                initialValue={mobileSidebarSpecRaw}
              />
            ),
          }}
          main={{
            headerTestId: "workspace-layout-v2-main-pane-header",
            content: (
              <MonacoEditorSurface
                branch="main"
                dataTestId="workspace-layout-v2-main-editor-surface"
                defaultValue={mobileSidebarSpecRaw}
                filePath="specs/workspace-layout-v2-main-pane.md"
                onMount={() => {}}
                showMobileLineNumbers={false}
                syncError={null}
                vaultKey={FIXTURE_VAULT_KEY}
              />
            ),
          }}
          right={{
            headerTestId: "workspace-layout-v2-right-pane-header",
            content: (
              <MonacoEditorSurface
                branch="main"
                dataTestId="workspace-layout-v2-right-editor-surface"
                defaultValue={mobileSidebarSpecRaw}
                filePath="specs/workspace-layout-v2-right-pane.md"
                onMount={() => {}}
                showMobileLineNumbers={false}
                syncError={null}
                vaultKey={FIXTURE_VAULT_KEY}
              />
            ),
          }}
          panel={{
            headerTestId: "workspace-layout-v2-panel-pane-header",
            content: (
              <ProsemarkReadOnly
                filePath="workspace-layout-v2-panel.md"
                value={mobileSidebarSpecRaw}
              />
            ),
          }}
        />
      </SidebarProvider>
    </AppPageFrame>
  );
}
