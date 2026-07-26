import { ChevronDownIcon } from "@/lib/radixIcons";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type FileViewEditorOverride = "default" | "codemirror";

function isFileViewEditorOverride(value: string | undefined) {
  return value === "default" || value === "codemirror";
}

type FileViewDeveloperToolsProps = {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  editorOverride: FileViewEditorOverride;
  onEditorOverrideChange: (editorOverride: FileViewEditorOverride) => void;
  contentTestId?: string;
};

export function FileViewDeveloperTools({
  open,
  onOpenChange,
  editorOverride,
  onEditorOverrideChange,
  contentTestId,
}: FileViewDeveloperToolsProps) {
  return (
    <Collapsible className="space-y-1.5" open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild nativeButton>
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui border bg-muted/20 px-2 py-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">Editor engine</div>
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
            <ToggleGroupItem value="codemirror" className="h-6 px-2 text-[11px]">
              CodeMirror
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
