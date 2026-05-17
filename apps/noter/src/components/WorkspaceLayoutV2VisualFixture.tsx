import { CodeMirrorFileSurface } from "#src/components/CodeMirrorFileSurface.tsx";
import { MonacoEditorSurface } from "#src/components/MonacoEditorSurface.tsx";
import { ProsemarkReadOnly } from "#src/components/ProsemarkReadOnly.tsx";
import { WorkspaceLayoutV2FixtureFrame } from "#src/components/WorkspaceLayoutV2FixtureFrame.tsx";
import mobileSidebarSpecRaw from "../../../../specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md?raw";
export type WorkspaceLayoutV2VisualMode = "workspace-layout-v2-status-bar";

const FIXTURE_VAULT_KEY = "workspace-layout-v2-fixture-vault";

export function WorkspaceLayoutV2VisualFixture() {
  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="workspace-layout-v2-visual-fixture"
      left={{
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
        content: (
          <ProsemarkReadOnly
            filePath="workspace-layout-v2-panel.md"
            value={mobileSidebarSpecRaw}
          />
        ),
      }}
    />
  );
}
