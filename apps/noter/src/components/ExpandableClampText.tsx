import { Button } from "#src/components/ui/button.tsx";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { type KeyboardEvent, type MouseEvent } from "react";

type ExpandableClampToggleButtonProps = {
  isExpanded: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

export function ExpandableClampToggleButton(
  props: ExpandableClampToggleButtonProps,
) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-expanded={props.isExpanded}
      aria-label={
        props.isExpanded ? "Collapse full message" : "Expand full message"
      }
      className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
    >
      <ChevronDown
        className={clsx(
          "h-3.5 w-3.5 transition-transform",
          props.isExpanded ? "rotate-180" : "",
        )}
      />
    </Button>
  );
}
