import { type ReactNode } from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type FileViewMode = "editor" | "graph";
export type FileViewEditorOverride = "default" | "codemirror";

function isFileViewEditorOverride(
  value: string,
): value is FileViewEditorOverride {
  return value === "default" || value === "codemirror";
}

type FileViewDeveloperToolsProps = {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  viewMode: FileViewMode;
  onViewModeChange: (viewMode: FileViewMode) => void;
  editorOverride?: FileViewEditorOverride;
  onEditorOverrideChange?: (editorOverride: FileViewEditorOverride) => void;
  children: ReactNode;
  contentTestId?: string;
};

/**
 * FileView keeps graph mode behind the developer tools section by default, but
 * still needs a stable way back to editor mode when that advanced surface is
 * active. The section also survives Daytona pauses because graph mode is still
 * a FileView-owned developer surface.
 */
export function FileViewDeveloperTools({
  open,
  onOpenChange,
  viewMode,
  onViewModeChange,
  editorOverride,
  onEditorOverrideChange,
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
        {editorOverride !== undefined && onEditorOverrideChange ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui border bg-muted/20 px-2 py-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              Editor engine
            </div>
            <ToggleGroup
              type="single"
              value={editorOverride}
              variant="outline"
              size="sm"
              className="justify-start"
              onValueChange={(nextEditorOverride) => {
                if (isFileViewEditorOverride(nextEditorOverride)) {
                  onEditorOverrideChange(nextEditorOverride);
                }
              }}
            >
              <ToggleGroupItem value="default" className="h-6 px-2 text-[11px]">
                Auto
              </ToggleGroupItem>
              <ToggleGroupItem
                value="codemirror"
                className="h-6 px-2 text-[11px]"
              >
                CodeMirror
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        ) : null}
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
