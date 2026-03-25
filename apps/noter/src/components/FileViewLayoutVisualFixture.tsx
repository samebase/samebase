import { PersonIcon } from "@radix-ui/react-icons";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";

export type FileViewLayoutVisualMode = "fileview-layout";

export function FileViewLayoutVisualFixture({
  mode,
}: {
  mode: FileViewLayoutVisualMode;
}) {
  mode satisfies FileViewLayoutVisualMode;

  return (
    <SidebarProvider
      defaultOpen={true}
      className="h-[720px] min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="fileview-layout-visual-fixture"
        headerTestId="fileview-layout-header"
        sidebarHeader={
          <SidebarAccountSection dataTestId="fileview-layout-account-section">
            <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
              <span className="block min-w-0 truncate">nicu@noter.md</span>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-ui md:h-6 md:w-6"
              >
                <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
                <span className="sr-only">Open user menu</span>
              </Button>
            </div>
          </SidebarAccountSection>
        }
        sidebarContent={
          <div
            data-testid="fileview-layout-sidebar-body"
            className="min-h-0 flex-1 bg-muted/10"
          />
        }
        headerTitle="/"
        headerRight={
          <div className="font-mono text-xs text-muted-foreground">e4c2a91</div>
        }
        onQuickOpen={() => {}}
        contentClassName="flex-1 min-h-0 p-0"
      >
        <div
          data-testid="fileview-layout-body"
          className="h-full min-h-0 bg-muted/10"
        />
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
