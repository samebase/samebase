import { type ReactNode } from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";

export type FileViewMode = "editor" | "graph";

type FileViewDeveloperToolsProps = {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  viewMode: FileViewMode;
  onViewModeChange: (viewMode: FileViewMode) => void;
  children: ReactNode;
  contentTestId?: string;
};

/**
 * FileView keeps graph mode behind the developer tools section by default, but
 * still needs a stable way back to editor mode when that advanced surface is active.
 */
export function FileViewDeveloperTools({
  open,
  onOpenChange,
  viewMode,
  onViewModeChange,
  children,
  contentTestId,
}: FileViewDeveloperToolsProps) {
  return (
    <Collapsible
      className="space-y-1.5"
      open={open}
      onOpenChange={onOpenChange}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto self-start gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-state=open]>svg]:rotate-180"
        >
          Developer tools
          <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        forceMount
        data-testid={contentTestId}
        className="space-y-1.5 data-[state=closed]:hidden"
      >
        <Tabs
          value={viewMode}
          onValueChange={(nextViewMode) => {
            if (nextViewMode === "editor" || nextViewMode === "graph") {
              onViewModeChange(nextViewMode);
            }
          }}
        >
          <TabsList className="h-7">
            <TabsTrigger value="editor" className="px-2 text-xs">
              Editor
            </TabsTrigger>
            <TabsTrigger value="graph" className="px-2 text-xs">
              Graph
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
