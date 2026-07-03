import { FileText, FolderTree, GitBranch, Home, Library } from "lucide-react";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { WorkspaceLayoutV3FullPage } from "@/components/workspace-layout-v3/WorkspaceLayoutV3FullPage";
import mobileSidebarSpecRaw from "../../../../specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md?raw";
export type WorkspaceLayoutV3VisualMode = "workspace-layout-v3";

const FIXTURE_VAULT_KEY = "workspace-layout-v3-fixture-vault";

function FixtureListPane({ rows }: { rows: readonly string[] }) {
  return (
    <div>
      {rows.map((row) => (
        <div key={row} className="border-b border-border px-3 py-1.5 text-[13px]">
          {row}
        </div>
      ))}
    </div>
  );
}

/**
 * Mounts the pane-trail layout with a fake five-pane drill-down so the shell
 * can be screenshotted and driven without seeded vault data. The /v3 route is
 * the real consumer; this fixture only exercises the layout mechanics.
 */
export function WorkspaceLayoutV3VisualFixture() {
  return (
    <WorkspaceLayoutV3FullPage
      dataTestId="workspace-layout-v3-visual-fixture"
      storageKey="workspace-layout-v3:fixture"
      panes={[
        {
          id: "nav",
          title: "Samebase",
          icon: <Home className="h-4 w-4" />,
          content: <FixtureListPane rows={["Vaults", "Providers", "Machines"]} />,
        },
        {
          id: "vaults",
          title: "Vaults",
          icon: <Library className="h-4 w-4" />,
          content: <FixtureListPane rows={["nicu/notes", "nicu/samebase", "nicu/recipes"]} />,
        },
        {
          id: "branches",
          title: "nicu/notes",
          icon: <GitBranch className="h-4 w-4" />,
          content: <FixtureListPane rows={["main", "drafts"]} />,
        },
        {
          id: "files",
          title: "main",
          icon: <FolderTree className="h-4 w-4" />,
          content: (
            <CodeMirrorFileSurface
              dataTestId="workspace-layout-v3-files-surface"
              filePath="workspace-layout-v3-files-pane.md"
              initialValue={mobileSidebarSpecRaw}
            />
          ),
        },
        {
          id: "editor",
          title: "072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md",
          icon: <FileText className="h-4 w-4" />,
          content: (
            <MonacoEditorSurface
              branch="main"
              dataTestId="workspace-layout-v3-editor-surface"
              defaultValue={mobileSidebarSpecRaw}
              filePath="specs/workspace-layout-v3-editor-pane.md"
              onMount={() => {}}
              showMobileLineNumbers={false}
              syncError={null}
              vaultKey={FIXTURE_VAULT_KEY}
            />
          ),
        },
      ]}
    />
  );
}
