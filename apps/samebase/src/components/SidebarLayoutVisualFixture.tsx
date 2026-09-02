import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { SidebarLayoutFixtureFrame } from "@/components/SidebarLayoutFixtureFrame";
import mobileSidebarSpecRaw from "../../../../specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md?raw";
export type SidebarLayoutVisualMode = "sidebar-layout-status-bar";

const FIXTURE_REPOSITORY_KEY = "sidebar-layout-fixture-repository";

export function SidebarLayoutVisualFixture() {
  return (
    <SidebarLayoutFixtureFrame
      left={{
        content: (
          <CodeMirrorFileSurface
            dataTestId="sidebar-layout-prosemark-surface"
            filePath="sidebar-layout-left-pane.md"
            initialValue={mobileSidebarSpecRaw}
          />
        ),
      }}
      main={{
        content: (
          <MonacoEditorSurface
            branch="main"
            dataTestId="sidebar-layout-main-editor-surface"
            defaultValue={mobileSidebarSpecRaw}
            filePath="specs/sidebar-layout-main-pane.md"
            onMount={() => {}}
            showMobileLineNumbers={false}
            syncError={null}
            repositoryKey={FIXTURE_REPOSITORY_KEY}
          />
        ),
      }}
      right={{
        content: (
          <MonacoEditorSurface
            branch="main"
            dataTestId="sidebar-layout-right-editor-surface"
            defaultValue={mobileSidebarSpecRaw}
            filePath="specs/sidebar-layout-right-pane.md"
            onMount={() => {}}
            showMobileLineNumbers={false}
            syncError={null}
            repositoryKey={FIXTURE_REPOSITORY_KEY}
          />
        ),
      }}
    />
  );
}
