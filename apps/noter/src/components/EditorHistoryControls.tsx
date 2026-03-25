import { Redo2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EditorHistoryControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  className?: string;
};

export function EditorHistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
}: EditorHistoryControlsProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 md:h-6 md:w-6"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo"
        aria-label="Undo"
      >
        <Undo2 className="h-4 w-4 md:h-3.5 md:w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 md:h-6 md:w-6"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo"
        aria-label="Redo"
      >
        <Redo2 className="h-4 w-4 md:h-3.5 md:w-3.5" />
      </Button>
    </div>
  );
}
